/* Mindscore — Vanilla JavaScript */
(() => {
    'use strict';

    /* ==========================================
       1. API CONFIGURATION
    ========================================== */

    const API_URL =
        "https://mental-health-score-predictor-xa88.onrender.com/predict";

    const SCORE_MAX = 10;
    const MIN_LOADING_MS = 800;

    const REQUIRED = [
        'age',
        'gender',
        'country',
        'academic_level',
        'most_used_platform',
        'purpose_of_use',
        'avg_daily_usage_hours',
        'daily_unlocks',
        'study_hours',
        'physical_activity_hours',
        'sleep_hours_per_night',
        'stress_level'
    ];

    const NUMERIC = [
        'age',
        'avg_daily_usage_hours',
        'daily_unlocks',
        'study_hours',
        'physical_activity_hours',
        'sleep_hours_per_night'
    ];

    const INTEGER_FIELDS = [
        'age',
        'daily_unlocks'
    ];

    const KNOWN_COUNTRIES = [
        'India',
        'USA',
        'Canada',
        'Australia',
        'UK',
        'Germany',
        'Turkey',
        'Mexico',
        'France'
    ];

    const COUNTRY_ALIASES = {
        'united states': 'USA',
        'united states of america': 'USA',
        'us': 'USA',
        'america': 'USA',
        'united kingdom': 'UK',
        'great britain': 'UK',
        'england': 'UK',
        'britain': 'UK',
        'turkiye': 'Turkey',
        'türkiye': 'Turkey'
    };


    /* ==========================================
       2. COUNTRY NORMALIZATION
    ========================================== */

    function normaliseCountry(raw) {

        const t = raw.trim();
        const key = t.toLowerCase();

        if (COUNTRY_ALIASES[key]) {
            return COUNTRY_ALIASES[key];
        }

        const hit = KNOWN_COUNTRIES.find(
            country => country.toLowerCase() === key
        );

        if (hit) {
            return hit;
        }

        return t.replace(
            /\b\w/g,
            letter => letter.toUpperCase()
        );
    }


    /* ==========================================
       3. DOM ELEMENTS
    ========================================== */

    const form = document.getElementById('prediction-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');

    const countEl = document.getElementById('count');
    const progressFill = document.getElementById('progress-fill');

    const panel = document.getElementById('result');
    const scoreEl = document.getElementById('score-output');
    const latencyEl = document.getElementById('latency-output');

    const errorEl = document.getElementById('error-message');

    const arc = document.getElementById('arc-fill');
    const marker = document.getElementById('marker');
    const ticksG = document.getElementById('ticks');

    if (!form) {
        console.error(
            'Prediction form not found. Check #prediction-form in HTML.'
        );
        return;
    }

    const sliders = Array.from(
        form.querySelectorAll('.slider')
    );

    const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    const touched = new Set();


    /* ==========================================
       4. GAUGE CONFIGURATION
    ========================================== */

    const CX = 120;
    const CY = 125;
    const R = 100;

    const ARC_LEN = arc.getTotalLength();

    arc.style.strokeDasharray = ARC_LEN;

    for (let i = 0; i <= SCORE_MAX; i++) {

        const a = Math.PI * (1 - i / SCORE_MAX);

        const major =
            i === 0 ||
            i === SCORE_MAX ||
            i === SCORE_MAX / 2;

        const r1 = 109;
        const r2 = major ? 121 : 116;

        const line = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'line'
        );

        line.setAttribute(
            'class',
            major ? 'tick major' : 'tick'
        );

        line.setAttribute(
            'x1',
            (CX + r1 * Math.cos(a)).toFixed(2)
        );

        line.setAttribute(
            'y1',
            (CY - r1 * Math.sin(a)).toFixed(2)
        );

        line.setAttribute(
            'x2',
            (CX + r2 * Math.cos(a)).toFixed(2)
        );

        line.setAttribute(
            'y2',
            (CY - r2 * Math.sin(a)).toFixed(2)
        );

        ticksG.appendChild(line);
    }


    /* ==========================================
       5. GAUGE ANIMATION
    ========================================== */

    let shown = 0;
    let raf = 0;

    function drawGauge(value) {

        const f = Math.max(
            0,
            Math.min(1, value / SCORE_MAX)
        );

        const a = Math.PI * (1 - f);

        arc.style.strokeDashoffset =
            ARC_LEN * (1 - f);

        marker.setAttribute(
            'cx',
            (CX + R * Math.cos(a)).toFixed(2)
        );

        marker.setAttribute(
            'cy',
            (CY - R * Math.sin(a)).toFixed(2)
        );

        scoreEl.textContent = value.toFixed(1);
    }


    function animateTo(target, duration = 1200) {

        cancelAnimationFrame(raf);

        if (reduceMotion || duration === 0) {

            shown = target;
            drawGauge(shown);

            return;
        }

        const from = shown;
        const t0 = performance.now();

        const step = now => {

            const p = Math.min(
                1,
                (now - t0) / duration
            );

            const eased = 1 - Math.pow(1 - p, 3);

            shown = from + (target - from) * eased;

            drawGauge(shown);

            if (p < 1) {
                raf = requestAnimationFrame(step);
            }
        };

        raf = requestAnimationFrame(step);
    }


    function setState(state) {
        panel.dataset.state = state;
    }


    /* ==========================================
       6. SLIDER HANDLING
    ========================================== */

    function paintSlider(el) {

        const pct =
            ((el.value - el.min) / (el.max - el.min)) * 100;

        el.style.setProperty('--fill', pct + '%');

        const out = form.querySelector(
            `[data-out="${el.name}"]`
        );

        if (!out) return;

        if (touched.has(el.name)) {

            out.textContent = `${Number(el.value)} hrs`;

            out.classList.add('set');
            el.classList.add('set');

        } else {

            out.textContent = '—';

            out.classList.remove('set');
            el.classList.remove('set');
        }
    }


    sliders.forEach(el => {

        paintSlider(el);

        el.addEventListener('input', () => {

            touched.add(el.name);

            paintSlider(el);
        });
    });


    /* ==========================================
       7. FORM PROGRESS
    ========================================== */

    function isAnswered(name) {

        const field = form.elements[name];

        if (!field) return false;

        if (field.type === 'range') {
            return touched.has(name);
        }

        const v = String(field.value ?? '').trim();

        if (v === '') return false;

        if (name === 'age') {

            return (
                Number.isInteger(Number(v)) &&
                Number(v) >= 10 &&
                Number(v) <= 100
            );
        }

        if (name === 'daily_unlocks') {

            return (
                Number.isInteger(Number(v)) &&
                Number(v) >= 0
            );
        }

        return true;
    }


    function updateProgress() {

        const done = REQUIRED.filter(isAnswered).length;

        progressFill.style.width =
            (done / REQUIRED.length) * 100 + '%';

        countEl.textContent =
            done === REQUIRED.length
                ? 'All set'
                : `${done} of ${REQUIRED.length} answered`;

        submitBtn.disabled =
            done !== REQUIRED.length;
    }


    form.addEventListener('input', updateProgress);
    form.addEventListener('change', updateProgress);


    /* ==========================================
       8. RESET FORM
    ========================================== */

    form.addEventListener('reset', () => {

        setTimeout(() => {

            touched.clear();

            sliders.forEach(paintSlider);

            updateProgress();

            setState('idle');

            animateTo(0, 500);

            errorEl.textContent = '';

            latencyEl.textContent = '—';

            btnText.textContent = 'Get my estimate';

        }, 0);
    });


    /* ==========================================
       9. API RESPONSE HANDLING
    ========================================== */

    function extractScore(data) {

        if (typeof data === 'number') {
            return data;
        }

        if (Array.isArray(data)) {
            return extractScore(data[0]);
        }

        if (data && typeof data === 'object') {

            const keys = [
                'predicted_mental_health_score',
                'prediction',
                'predicted_score',
                'score',
                'mental_health_score',
                'result'
            ];

            for (const key of keys) {

                if (key in data) {
                    return extractScore(data[key]);
                }
            }
        }

        const n = Number(data);

        return Number.isFinite(n) ? n : NaN;
    }


    /* ==========================================
       10. ERROR HANDLING
    ========================================== */

    function errorText(data, status) {

        const detail = data?.detail;

        if (status === 405) {

            return (
                '405 Method Not Allowed. The deployed server ' +
                'does not accept POST at /predict. Check your ' +
                'FastAPI deployment and OpenAPI documentation.'
            );
        }

        if (status === 404) {

            return (
                '404 Not Found. The /predict endpoint was not found. ' +
                'Verify the backend URL.'
            );
        }

        if (status === 422) {

            if (Array.isArray(detail)) {

                return detail.map(error => {

                    const field =
                        (error.loc || []).slice(-1)[0] || 'field';

                    return `${field}: ${error.msg}`;

                }).join(' · ');
            }

            return JSON.stringify(detail || data);
        }

        if (status === 500) {

            return (
                '500 Internal Server Error. Check your FastAPI ' +
                'backend and Render deployment logs.'
            );
        }

        if (typeof detail === 'string') {
            return detail;
        }

        return `Server returned status ${status}.`;
    }


    const wait = ms =>
        new Promise(resolve => setTimeout(resolve, ms));


    /* ==========================================
       11. BUILD API PAYLOAD
    ========================================== */

    function buildPayload() {

        const payload = {};

        new FormData(form).forEach((value, key) => {

            payload[key] = NUMERIC.includes(key)
                ? Number(value)
                : String(value).trim();
        });

        INTEGER_FIELDS.forEach(key => {

            payload[key] = Math.round(payload[key]);
        });

        if (payload.country) {

            payload.country = normaliseCountry(
                payload.country
            );
        }

        return payload;
    }


    /* ==========================================
       12. SEND PREDICTION REQUEST
    ========================================== */

    async function sendPrediction(payload) {

        console.log('================================');
        console.log('MINDSCORE API REQUEST');
        console.log('================================');

        console.log('API URL:', API_URL);
        console.log('HTTP METHOD: POST');
        console.log('Request payload:', payload);

        const response = await fetch(API_URL, {

            method: 'POST',

            mode: 'cors',

            // Do not silently follow redirects that could
            // change the POST request into a GET request.
            redirect: 'error',

            cache: 'no-store',

            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },

            body: JSON.stringify(payload)
        });

        console.log('Response status:', response.status);
        console.log('Response URL:', response.url);
        console.log('Was redirected:', response.redirected);

        const contentType =
            response.headers.get('content-type') || '';

        let data;

        if (contentType.includes('application/json')) {

            data = await response.json();

        } else {

            data = await response.text();
        }

        console.log('Response data:', data);

        if (!response.ok) {

            throw new Error(
                errorText(data, response.status)
            );
        }

        return data;
    }


    /* ==========================================
       13. FORM SUBMISSION
    ========================================== */

    form.addEventListener('submit', async e => {

        e.preventDefault();

        if (submitBtn.disabled) {
            return;
        }

        errorEl.textContent = '';

        const payload = buildPayload();

        setState('loading');

        submitBtn.disabled = true;

        btnText.textContent = 'Reading…';

        animateTo(0, 300);

        const t0 = performance.now();

        try {

            // Send prediction request and maintain
            // minimum loading animation time.
            const [data] = await Promise.all([

                sendPrediction(payload),

                wait(MIN_LOADING_MS)
            ]);

            /* ---------- Extract prediction ---------- */

            const raw = extractScore(data);

            if (!Number.isFinite(raw)) {

                throw new Error(
                    'The API response does not contain a valid ' +
                    'predicted_mental_health_score.'
                );
            }

            /* ---------- Format score ---------- */

            const score = Math.max(
                0,
                Math.min(SCORE_MAX, raw)
            );

            /* ---------- Update UI ---------- */

            latencyEl.textContent = Math.round(
                performance.now() - t0
            );

            setState('done');

            animateTo(score);

            console.log('Prediction successful:', score);

        } catch (err) {

            console.error('Prediction error:', err);

            if (err instanceof TypeError) {

                errorEl.textContent =
                    'Unable to connect to the FastAPI backend. ' +
                    'Check your API URL, Render service status, ' +
                    'and CORS configuration.';

            } else {

                errorEl.textContent = err.message;
            }

            setState('error');

            animateTo(0, 300);

        } finally {

            btnText.textContent = 'Get my estimate';

            updateProgress();
        }
    });


    /* ==========================================
       14. INITIALIZATION
    ========================================== */

    drawGauge(0);

    updateProgress();

    console.log('Mindscore frontend initialized.');

    console.log('Backend API:', API_URL);

})();