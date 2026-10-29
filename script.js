/* Mindscore — vanilla JS, no dependencies */
(() => {
    'use strict';

    /* ---------- Config ---------- */
    const API_URL = 'https://mental-health-score-predictor-xa88.onrender.com'; // your FastAPI endpoint
    const SCORE_MAX = 10;                            // top of the gauge scale
    const MIN_LOADING_MS = 800;                      // so the loading state is readable

    const REQUIRED = [
        'age', 'gender', 'country', 'academic_level',
        'most_used_platform', 'purpose_of_use', 'avg_daily_usage_hours', 'daily_unlocks',
        'study_hours', 'physical_activity_hours', 'sleep_hours_per_night', 'stress_level'
    ];
    const NUMERIC = [
        'age', 'avg_daily_usage_hours', 'daily_unlocks',
        'study_hours', 'physical_activity_hours', 'sleep_hours_per_night'
    ];

    // Countries the model knows; anything else is grouped as "Other" by app.py.
    // Matching is case-sensitive on the server, so we normalise "usa" -> "USA", etc.
    const KNOWN_COUNTRIES = [
        'India', 'USA', 'Canada', 'Australia', 'UK', 'Germany', 'Turkey', 'Mexico', 'France'
    ];
    const COUNTRY_ALIASES = {
        'united states': 'USA', 'united states of america': 'USA', 'us': 'USA', 'america': 'USA',
        'united kingdom': 'UK', 'great britain': 'UK', 'england': 'UK', 'britain': 'UK',
        'turkiye': 'Turkey', 'türkiye': 'Turkey'
    };

    function normaliseCountry(raw) {
        const t = raw.trim();
        const key = t.toLowerCase();
        if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
        const hit = KNOWN_COUNTRIES.find((c) => c.toLowerCase() === key);
        if (hit) return hit;
        // Unknown country: Title Case it (the server groups it as "Other")
        return t.replace(/\b\w/g, (m) => m.toUpperCase());
    }

    const INTEGER_FIELDS = ['age', 'daily_unlocks']; // backend declares these as int

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
    const sliders = Array.from(form.querySelectorAll('.slider'));

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touched = new Set(); // sliders only count once the user has moved them

    /* ---------- Gauge ---------- */
    const CX = 120, CY = 125, R = 100;
    const ARC_LEN = arc.getTotalLength();
    arc.style.strokeDasharray = ARC_LEN;

    // Tick marks around the arc (one per score point)
    for (let i = 0; i <= SCORE_MAX; i++) {
        const a = Math.PI * (1 - i / SCORE_MAX);
        const major = i === 0 || i === SCORE_MAX || i === SCORE_MAX / 2;
        const r1 = 109, r2 = major ? 121 : 116;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', major ? 'tick major' : 'tick');
        line.setAttribute('x1', (CX + r1 * Math.cos(a)).toFixed(2));
        line.setAttribute('y1', (CY - r1 * Math.sin(a)).toFixed(2));
        line.setAttribute('x2', (CX + r2 * Math.cos(a)).toFixed(2));
        line.setAttribute('y2', (CY - r2 * Math.sin(a)).toFixed(2));
        ticksG.appendChild(line);
    }

    let shown = 0;
    let raf = 0;

    function drawGauge(value) {
        const f = Math.max(0, Math.min(1, value / SCORE_MAX));
        const a = Math.PI * (1 - f);
        arc.style.strokeDashoffset = ARC_LEN * (1 - f);
        marker.setAttribute('cx', (CX + R * Math.cos(a)).toFixed(2));
        marker.setAttribute('cy', (CY - R * Math.sin(a)).toFixed(2));
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
        const step = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            shown = from + (target - from) * eased;
            drawGauge(shown);
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
    }

    function setState(state) {
        panel.dataset.state = state;
    }

    /* ---------- Sliders ---------- */
    function paintSlider(el) {
        const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
        el.style.setProperty('--fill', pct + '%');
        const out = form.querySelector(`[data-out="${el.name}"]`);
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

    sliders.forEach((el) => {
        paintSlider(el);
        el.addEventListener('input', () => {
            touched.add(el.name);
            paintSlider(el);
        });
    });

    /* ---------- Progress ---------- */
    function isAnswered(name) {
        const field = form.elements[name];
        if (!field) return false;
        if (field.type === 'range') return touched.has(name);
        const v = String(field.value ?? '').trim();
        if (v === '') return false;
        if (name === 'age') return Number.isInteger(Number(v)) && Number(v) >= 10 && Number(v) <= 100;
        if (name === 'daily_unlocks') return Number.isInteger(Number(v)) && Number(v) >= 0;
        return true;
    }

    function updateProgress() {
        const done = REQUIRED.filter(isAnswered).length;
        progressFill.style.width = (done / REQUIRED.length) * 100 + '%';
        countEl.textContent = done === REQUIRED.length
            ? 'All set'
            : `${done} of ${REQUIRED.length} answered`;
        submitBtn.disabled = done !== REQUIRED.length;
    }

    form.addEventListener('input', updateProgress);
    form.addEventListener('change', updateProgress);

    /* ---------- Reset ---------- */
    form.addEventListener('reset', () => {
        // wait for the browser to restore default values first
        setTimeout(() => {
            touched.clear();
            sliders.forEach(paintSlider);
            updateProgress();
            setState('idle');
            animateTo(0, 500);
        }, 0);
    });

    /* ---------- API helpers ---------- */
    function extractScore(data) {
        if (typeof data === 'number') return data;
        if (Array.isArray(data)) return extractScore(data[0]);
        if (data && typeof data === 'object') {
            const keys = ['predicted_mental_health_score', 'prediction', 'predicted_score', 'score', 'mental_health_score', 'result'];
            for (const k of keys) if (k in data) return extractScore(data[k]);
            for (const v of Object.values(data)) {
                const n = Number(v);
                if (v !== null && v !== '' && Number.isFinite(n)) return n;
            }
        }
        const n = Number(data);
        return Number.isFinite(n) ? n : NaN;
    }

    function errorText(data, status) {
        const d = data && data.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) {
            return d.map((e) => `${(e.loc || []).slice(-1)[0] || 'field'}: ${e.msg}`).join(' · ');
        }
        return `The server answered with status ${status}.`;
    }

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ---------- Submit ---------- */
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.disabled) return;

        const payload = {};
        new FormData(form).forEach((value, key) => {
            payload[key] = NUMERIC.includes(key) ? Number(value) : String(value).trim();
        });
        INTEGER_FIELDS.forEach((k) => { payload[k] = Math.round(payload[k]); });
        payload.country = normaliseCountry(payload.country);

        setState('loading');
        submitBtn.disabled = true;
        btnText.textContent = 'Reading…';
        animateTo(0, 300);

        const t0 = performance.now();
        try {
            const [res] = await Promise.all([
                fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }),
                wait(MIN_LOADING_MS)
            ]);

            let data = null;
            try { data = await res.json(); } catch (_) { /* non-JSON body */ }

            if (!res.ok) throw new Error(errorText(data, res.status));

            const raw = extractScore(data);
            if (!Number.isFinite(raw)) throw new Error('The response did not contain a numeric score.');

            const score = Math.max(0, Math.min(SCORE_MAX, raw));
            latencyEl.textContent = Math.round(performance.now() - t0);
            setState('done');
            animateTo(score);
        } catch (err) {
            const offline = err instanceof TypeError;
            errorEl.textContent = offline
                ? `Couldn't reach the API at ${API_URL}. Check that uvicorn is running and the port matches.`
                : err.message;
            setState('error');
            animateTo(0, 300);
        } finally {
            btnText.textContent = 'Get my estimate';
            updateProgress();
        }
    });

    /* ---------- Init ---------- */
    drawGauge(0);
    updateProgress();
})();