/* Mindscore — vanilla JS, no dependencies */
(() => {
    'use strict';

    /* ---------- Config ---------- */

    // Use this when frontend and FastAPI backend are deployed
    // on the same Render service.
    const API_URL = `https://mental-health-score-predictor-xa88.onrender.com/predict`;

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

    // Countries recognized by the model.
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

        // Unknown countries are grouped as "Other" by the backend.
        return t.replace(/\b\w/g, letter => letter.toUpperCase());
    }

    // The backend expects these fields as integers.
    const INTEGER_FIELDS = ['age', 'daily_unlocks'];


    /* ---------- Elements ---------- */

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

    const sliders = Array.from(
        form.querySelectorAll('.slider')
    );

    const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    // Tracks sliders that the user has changed.
    const touched = new Set();


    /* ---------- Gauge ---------- */

    const CX = 120;
    const CY = 125;
    const R = 100;

    const ARC_LEN = arc.getTotalLength();

    arc.style.strokeDasharray = ARC_LEN;

    // Draw gauge tick marks.
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

    let shown = 0;
    let raf = 0;

    function drawGauge(value) {
        const f = Math.max(
            0,
            Math.min(1, value / SCORE_MAX)
        );

        const a = Math.PI * (1 - f);

        arc.style.strokeDashoffset = ARC_LEN * (1 - f);

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


    /* ---------- Sliders ---------- */

    function paintSlider(el) {
        const pct =
            ((el.value - el.min) / (el.max - el.min)) * 100;

        el.style.setProperty('--fill', pct + '%');

        const out = form.querySelector(
            `[data-out="${el.name}"]`
        );

        if (!out) {
            return;
        }

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


    /* ---------- Progress ---------- */

    function isAnswered(name) {
        const field = form.elements[name];

        if (!field) {
            return false;
        }

        if (field.type === 'range') {
            return touched.has(name);
        }

        const v = String(field.value ?? '').trim();

        if (v === '') {
            return false;
        }

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

        submitBtn.disabled = done !== REQUIRED.length;
    }

    form.addEventListener('input', updateProgress);
    form.addEventListener('change', updateProgress);


    /* ---------- Reset ---------- */

    form.addEventListener('reset', () => {
        // Wait for the browser to restore default values.
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


    /* ---------- API Helpers ---------- */

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

    function errorText(data, status) {
        const detail = data && data.detail;

        if (status === 405) {
            return (
                '405 Method Not Allowed. The request reached a route ' +
                'that does not accept POST. Verify the /predict route ' +
                'in your FastAPI backend and confirm API_URL.'
            );
        }

        if (status === 404) {
            return (
                '404 Not Found. Check whether the prediction endpoint ' +
                'is /predict and whether API_URL points to the backend.'
            );
        }

        if (status === 422 && Array.isArray(detail)) {
            return detail
                .map(error => {
                    const field =
                        (error.loc || []).slice(-1)[0] || 'field';

                    return `${field}: ${error.msg}`;
                })
                .join(' · ');
        }

        if (typeof detail === 'string') {
            return detail;
        }

        return `The server answered with status ${status}.`;
    }

    const wait = ms =>
        new Promise(resolve => setTimeout(resolve, ms));


    /* ---------- Submit ---------- */

    form.addEventListener('submit', async e => {
        e.preventDefault();

        if (submitBtn.disabled) {
            return;
        }

        errorEl.textContent = '';

        // Build the JSON payload from the form fields.
        const payload = {};

        new FormData(form).forEach((value, key) => {
            payload[key] = NUMERIC.includes(key)
                ? Number(value)
                : String(value).trim();
        });

        // Convert integer fields to integers.
        INTEGER_FIELDS.forEach(key => {
            payload[key] = Math.round(payload[key]);
        });

        // Normalize country names.
        if (payload.country) {
            payload.country = normaliseCountry(
                payload.country
            );
        }

        setState('loading');

        submitBtn.disabled = true;
        btnText.textContent = 'Reading…';

        animateTo(0, 300);

        const t0 = performance.now();

        try {
            const [res] = await Promise.all([
                fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }),

                wait(MIN_LOADING_MS)
            ]);

            let data = null;

            try {
                data = await res.json();
            } catch (_) {
                // The response was not valid JSON.
            }

            console.log('API URL:', API_URL);
            console.log('Request payload:', payload);
            console.log('Response status:', res.status);
            console.log('Response data:', data);

            if (!res.ok) {
                throw new Error(
                    errorText(data, res.status)
                );
            }

            // Extract the predicted mental health score.
            const raw = extractScore(data);

            if (!Number.isFinite(raw)) {
                throw new Error(
                    'The API response did not contain a numeric ' +
                    'prediction. Check the response format in app.py.'
                );
            }

            // Keep the displayed score within 0–10.
            const score = Math.max(
                0,
                Math.min(SCORE_MAX, raw)
            );

            latencyEl.textContent = Math.round(
                performance.now() - t0
            );

            setState('done');
            animateTo(score);

        } catch (err) {
            console.error('Prediction error:', err);

            if (err instanceof TypeError) {
                errorEl.textContent =
                    `Could not reach the API at ${API_URL}. ` +
                    'Check the backend URL, deployment status, ' +
                    'and browser console for network or CORS errors.';
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


    /* ---------- Initialization ---------- */

    drawGauge(0);
    updateProgress();

})();