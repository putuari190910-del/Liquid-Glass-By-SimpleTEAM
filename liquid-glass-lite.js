(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LiquidGlass = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const MAX_AREA = 420000;

    // Lite API: solid tint, edge, and refraction only.
    const DEFAULTS = {
        borderRadius: null,
        glassColorHex: '#ffffff',
        glassColorAlpha: 0,
        renderScale: 1,

        refraction: {
            amount: 100,
            radius: 15
        },

        edge: {
            width: 1,
            opacity: 0.6,
            top: 1,
            right: 1,
            bottom: 1,
            left: 1
        }
    };

    const VARS = [
        'color', 'ew', 'eo', 'et', 'eb',
        'el', 'er', 'bf', 'mx', 'my', 'r'
    ];

    const CSS_TEXT = [
        '.lg-glass{background:var(--lg-color);-webkit-backdrop-filter:var(--lg-bf);backdrop-filter:var(--lg-bf)}',

        '.lg-glass>.lg-border{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;border-radius:inherit;z-index:-1;padding:1px;opacity:var(--lg-eo);pointer-events:none;border-top:var(--lg-ew) solid rgba(255,255,255,var(--lg-et));border-bottom:var(--lg-ew) solid rgba(255,255,255,var(--lg-eb))}',

        '.lg-glass>.lg-border::before{content:"";position:absolute;box-sizing:border-box;top:calc(var(--lg-ew) * -1);bottom:calc(var(--lg-ew) * -1);left:0;right:0;border-radius:inherit;border-left:var(--lg-ew) solid rgba(0,0,0,var(--lg-el));border-right:var(--lg-ew) solid rgba(0,0,0,var(--lg-er))}',

        '.lg-glass.lg-out{background:none;-webkit-backdrop-filter:none;backdrop-filter:none}',

        '.lg-glass>.lg-bd{position:absolute;inset:calc(var(--lg-my) * -1) calc(var(--lg-mx) * -1);z-index:-3;pointer-events:none;-webkit-backdrop-filter:var(--lg-bf);backdrop-filter:var(--lg-bf);clip-path:inset(var(--lg-my) var(--lg-mx) round var(--lg-r))}',

        '.lg-glass>.lg-body{position:absolute;inset:0;box-sizing:border-box;border-radius:inherit;z-index:-2;pointer-events:none;background:var(--lg-color)}'
    ].join('\n');

    let uid = 0;
    let count = 0;
    let styleEl = null;
    let defsSvg = null;
    let defs = null;

    function ensureStyle() {
        if (styleEl && styleEl.isConnected) return;

        const existing = document.querySelector(
            'style[data-liquid-glass]'
        );

        if (existing) {
            styleEl = existing;
            return;
        }

        styleEl = document.createElement('style');
        styleEl.setAttribute('data-liquid-glass', '');
        styleEl.textContent = CSS_TEXT;

        (document.head || document.documentElement)
            .appendChild(styleEl);
    }

    function ensureDefs() {
        if (defs && defs.isConnected) return defs;

        defsSvg = document.createElementNS(SVG_NS, 'svg');
        defsSvg.setAttribute('width', '0');
        defsSvg.setAttribute('height', '0');
        defsSvg.setAttribute('aria-hidden', 'true');

        defsSvg.style.cssText =
            'position:absolute;width:0;height:0;' +
            'overflow:hidden;pointer-events:none';

        defs = document.createElementNS(SVG_NS, 'defs');
        defsSvg.appendChild(defs);

        (document.body || document.documentElement)
            .appendChild(defsSvg);

        return defs;
    }

    function clone(o) {
        return JSON.parse(JSON.stringify(o));
    }

    function merge(target, src) {
        if (!src) return target;

        for (const k in src) {
            const v = src[k];

            if (
                v &&
                typeof v === 'object' &&
                !Array.isArray(v) &&
                target[k] &&
                typeof target[k] === 'object'
            ) {
                merge(target[k], v);
            } else if (v !== undefined) {
                target[k] = v;
            }
        }

        return target;
    }

    function hexToRgb(hex) {
        let h = String(hex).replace('#', '');

        if (h.length === 3) {
            h = h.split('')
                .map(ch => ch + ch)
                .join('');
        }

        const n = parseInt(h, 16);

        if (isNaN(n)) return '255, 255, 255';

        return (
            ((n >> 16) & 255) + ', ' +
            ((n >> 8) & 255) + ', ' +
            (n & 255)
        );
    }

    function level(v) {
        return Math.max(
            0,
            Math.min(255, Math.round(255 * v))
        );
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();

        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.moveTo(x + r, y);

            ctx.arcTo(
                x + w, y,
                x + w, y + h, r
            );

            ctx.arcTo(
                x + w, y + h,
                x, y + h, r
            );

            ctx.arcTo(
                x, y + h,
                x, y, r
            );

            ctx.arcTo(
                x, y,
                x + w, y, r
            );

            ctx.closePath();
        }
    }

    function geometry(w, h, refractionRadius, borderRadius) {
        const maxR = Math.min(w / 2, h / 2);

        const effectiveR = Math.min(
            borderRadius,
            maxR
        );

        const safeRef = Math.min(
            refractionRadius,
            maxR - 2
        );

        const inset = Math.max(1, safeRef * 0.45);
        const blurVal = Math.max(1, safeRef * 0.55);

        const innerW = Math.max(
            1,
            w - 2 * inset
        );

        const innerH = Math.max(
            1,
            h - 2 * inset
        );

        const innerR = Math.max(
            0,
            Math.min(
                effectiveR - inset,
                innerW / 2,
                innerH / 2
            )
        );

        return {
            inset,
            blurVal,
            innerW,
            innerH,
            innerR
        };
    }

    function svgMap(w, h, refractionRadius, borderRadius) {
        const g = geometry(
            w,
            h,
            refractionRadius,
            borderRadius
        );

        const svg =
            "<?xml version='1.0' encoding='UTF-8'?>" +
            "<svg width='" + w + "' height='" + h +
            "' xmlns='http://www.w3.org/2000/svg' " +
            "viewBox='0 0 " + w + " " + h + "'>" +

            "<defs>" +

            "<filter id='blur' " +
            "filterUnits='userSpaceOnUse' " +
            "x='0' y='0' width='" + w +
            "' height='" + h + "'>" +

            "<feGaussianBlur stdDeviation='" +
            g.blurVal + "' />" +

            "</filter>" +

            "<linearGradient id='xGradient' " +
            "x1='0%' y1='0%' x2='100%' y2='0%'>" +

            "<stop offset='0%' " +
            "stop-color='rgb(255,0,0)'></stop>" +

            "<stop offset='100%' " +
            "stop-color='rgb(0,0,0)'></stop>" +

            "</linearGradient>" +

            "<linearGradient id='yGradient' " +
            "x1='0%' y1='0%' x2='0%' y2='100%'>" +

            "<stop offset='0%' " +
            "stop-color='rgb(0,0,255)'></stop>" +

            "<stop offset='100%' " +
            "stop-color='rgb(0,0,0)'></stop>" +

            "</linearGradient>" +

            "</defs>" +

            "<rect width='" + w + "' height='" + h +
            "' fill='rgb(128,128,128)'></rect>" +

            "<rect width='" + w + "' height='" + h +
            "' fill='url(#xGradient)'></rect>" +

            "<rect width='" + w + "' height='" + h +
            "' fill='url(#yGradient)' " +
            "style='mix-blend-mode:screen'></rect>" +

            "<rect x='" + g.inset +
            "' y='" + g.inset +
            "' width='" + g.innerW +
            "' height='" + g.innerH +
            "' rx='" + g.innerR +
            "' ry='" + g.innerR +
            "' fill='rgb(128,128,128)' " +
            "filter='url(#blur)'></rect>" +

            "</svg>";

        return 'data:image/svg+xml,' +
            encodeURIComponent(svg);
    }

    function layout(W, H, hostW0, hostH0, scale) {
        const Wd = Math.max(1, W);
        const Hd = Math.max(1, H);

        const hostW = Math.max(1, hostW0);
        const hostH = Math.max(1, hostH0);

        const cw = Math.max(
            2,
            Math.round(Wd * scale)
        );

        const ch = Math.max(
            2,
            Math.round(Hd * scale)
        );

        const kx = cw / Wd;
        const ky = ch / Hd;

        return {
            hostW,
            hostH,
            cw,
            ch,
            kx,
            ky,

            ox: ((Wd - hostW) / 2) * kx,
            oy: ((Hd - hostH) / 2) * ky,

            hw: hostW * kx,
            hh: hostH * ky
        };
    }

    function rampLayer(ctx, L, kxAmp, kyAmp) {
        let grad = ctx.createLinearGradient(
            L.ox,
            0,
            L.ox + L.hw,
            0
        );

        grad.addColorStop(
            0,
            'rgb(' + level(0.5 + kxAmp) + ',0,0)'
        );

        grad.addColorStop(
            1,
            'rgb(' + level(0.5 - kxAmp) + ',0,0)'
        );

        ctx.fillStyle = grad;

        ctx.fillRect(
            L.ox,
            L.oy,
            L.hw,
            L.hh
        );

        grad = ctx.createLinearGradient(
            0,
            L.oy,
            0,
            L.oy + L.hh
        );

        grad.addColorStop(
            0,
            'rgb(0,0,' + level(0.5 + kyAmp) + ')'
        );

        grad.addColorStop(
            1,
            'rgb(0,0,' + level(0.5 - kyAmp) + ')'
        );

        ctx.fillStyle = grad;
        ctx.globalCompositeOperation = 'lighter';

        ctx.fillRect(
            L.ox,
            L.oy,
            L.hw,
            L.hh
        );

        ctx.globalCompositeOperation = 'source-over';
    }

    function bitmapMap(
        W,
        H,
        hostW0,
        hostH0,
        refractionRadius,
        borderRadius,
        scale
    ) {
        const L = layout(
            W,
            H,
            hostW0,
            hostH0,
            scale
        );

        const cv = document.createElement('canvas');

        cv.width = L.cw;
        cv.height = L.ch;

        const ctx = cv.getContext('2d');

        if (!ctx || !('filter' in ctx)) {
            return svgMap(
                L.hostW,
                L.hostH,
                refractionRadius,
                borderRadius
            );
        }

        const g = geometry(
            L.hostW,
            L.hostH,
            refractionRadius,
            borderRadius
        );

        ctx.fillStyle = 'rgb(128,128,128)';
        ctx.fillRect(0, 0, L.cw, L.ch);

        rampLayer(ctx, L, 0.5, 0.5);

        const k = Math.min(L.kx, L.ky);

        ctx.filter = 'blur(' + (g.blurVal * k) + 'px)';
        ctx.fillStyle = 'rgb(128,128,128)';

        roundRectPath(
            ctx,
            L.ox + g.inset * L.kx,
            L.oy + g.inset * L.ky,
            g.innerW * L.kx,
            g.innerH * L.ky,
            g.innerR * k
        );

        ctx.fill();
        ctx.filter = 'none';

        const url = cv.toDataURL('image/png');

        cv.width = 0;
        cv.height = 0;

        return url;
    }

    class LiquidGlass {
        constructor(el, options) {
            if (typeof el === 'string') {
                el = document.querySelector(el);
            }

            if (!el || el.nodeType !== 1) {
                throw new TypeError(
                    'LiquidGlass: element tidak ditemukan'
                );
            }

            if (el._liquidGlass) {
                if (options) {
                    el._liquidGlass.update(options);
                }

                return el._liquidGlass;
            }

            this.el = el;
            this.id = ++uid;
            this.filterId = 'lg-filter-' + this.id;

            this.config = merge(
                clone(DEFAULTS),
                options
            );

            this.width = 0;
            this.height = 0;
            this.radius = 0;

            this.primKey = '';
            this.mapKey = '';
            this.zmapKey = '';

            this.img = null;
            this.imgZ = null;

            this.dispG = null;
            this.dispR = null;
            this.dispB = null;
            this.dispZ = null;

            this.out = false;
            this.bdEl = null;
            this.bodyEl = null;

            this.mx = 0;
            this.my = 0;

            this._warned = false;
            this._timer = 0;
            this._ro = null;
            this._setPos = false;

            ensureStyle();

            this._mountFilter();
            this._mountDOM();

            el._liquidGlass = this;

            count++;

            this.refresh();
            this._observe();
        }

        _mountFilter() {
            const f = document.createElementNS(
                SVG_NS,
                'filter'
            );

            f.setAttribute('id', this.filterId);

            f.setAttribute(
                'color-interpolation-filters',
                'sRGB'
            );

            f.setAttribute('x', '0%');
            f.setAttribute('y', '0%');
            f.setAttribute('width', '100%');
            f.setAttribute('height', '100%');

            ensureDefs().appendChild(f);

            this.filter = f;
        }

        _mountDOM() {
            const el = this.el;

            if (getComputedStyle(el).position === 'static') {
                el.style.position = 'relative';
                this._setPos = true;
            }

            el.classList.add('lg-glass');

            this.borderEl = document.createElement('div');
            this.borderEl.className = 'lg-border';

            this.borderEl.setAttribute(
                'aria-hidden',
                'true'
            );

            el.insertBefore(
                this.borderEl,
                el.firstChild
            );
        }

        _setOut(out) {
            if (out === this.out) return;

            this.out = out;

            const el = this.el;

            if (out) {
                this.bdEl = document.createElement('div');
                this.bdEl.className = 'lg-bd';

                this.bdEl.setAttribute(
                    'aria-hidden',
                    'true'
                );

                this.bodyEl = document.createElement('div');
                this.bodyEl.className = 'lg-body';

                this.bodyEl.setAttribute(
                    'aria-hidden',
                    'true'
                );

                el.insertBefore(
                    this.bodyEl,
                    el.firstChild
                );

                el.insertBefore(
                    this.bdEl,
                    this.bodyEl
                );

                el.classList.add('lg-out');
            } else {
                if (this.bdEl) this.bdEl.remove();
                if (this.bodyEl) this.bodyEl.remove();

                this.bdEl = null;
                this.bodyEl = null;

                el.classList.remove('lg-out');
            }
        }

        _buildPrimitives() {
            if (this.primKey === 'refraction') return;

            this.primKey = 'refraction';

            const f = this.filter;

            while (f.firstChild) {
                f.removeChild(f.firstChild);
            }

            const img = document.createElementNS(
                SVG_NS,
                'feImage'
            );

            img.setAttribute('x', '0');
            img.setAttribute('y', '0');
            img.setAttribute('result', 'map');

            img.setAttribute(
                'preserveAspectRatio',
                'none'
            );

            f.appendChild(img);

            const disp = document.createElementNS(
                SVG_NS,
                'feDisplacementMap'
            );

            disp.setAttribute('in', 'SourceGraphic');
            disp.setAttribute('in2', 'map');
            disp.setAttribute('scale', '100');
            disp.setAttribute('xChannelSelector', 'R');
            disp.setAttribute('yChannelSelector', 'B');
            disp.setAttribute('result', 'out');

            f.appendChild(disp);

            this.img = img;
            this.imgZ = null;

            this.dispG = disp;
            this.dispR = null;
            this.dispB = null;
            this.dispZ = null;

            this.mapKey = '';
            this.zmapKey = '';
        }

        _measure() {
            const el = this.el;

            this.width = el.offsetWidth;
            this.height = el.offsetHeight;

            const cfg = this.config.borderRadius;

            if (typeof cfg === 'number') {
                this.radius = cfg;
                return;
            }

            const raw = (
                getComputedStyle(el).borderTopLeftRadius || '0'
            ).split(' ')[0];

            const num = parseFloat(raw) || 0;

            this.radius = raw.indexOf('%') > -1
                ? Math.min(this.width, this.height) * num / 100
                : num;
        }

        _sizeImgs(W, H) {
            const list = [this.img, this.imgZ];

            for (let i = 0; i < list.length; i++) {
                if (!list[i]) continue;

                list[i].setAttribute('width', W);
                list[i].setAttribute('height', H);
            }
        }

        _syncMap(st) {
            const w = this.width;
            const h = this.height;

            if (!w || !h) return;

            const c = this.config;
            const m = st.m;
            const scale = c.renderScale;

            const W = w + 2 * m.mx;
            const H = h + 2 * m.my;

            this._sizeImgs(W, H);

            if (this.img) {
                const key = [
                    w,
                    h,
                    this.radius,
                    (c.refraction && c.refraction.radius) || 15,
                    scale,
                    m.mx,
                    m.my
                ].join('|');

                if (key !== this.mapKey) {
                    this.mapKey = key;

                    this.img.setAttribute(
                        'href',
                        bitmapMap(
                            W,
                            H,
                            w,
                            h,
                            (
                                c.refraction &&
                                c.refraction.radius
                            ) || 15,
                            this.radius,
                            scale
                        )
                    );
                }
            }
        }

        apply() {
            const c = this.config;

            this.el.classList.add('lg-glass');

            const s = this.el.style;

            const set = function (k, v) {
                s.setProperty('--lg-' + k, v);
            };

            set(
                'color',
                'rgba(' +
                hexToRgb(c.glassColorHex) +
                ', ' +
                c.glassColorAlpha +
                ')'
            );

            set('ew', c.edge.width + 'px');
            set('eo', c.edge.opacity);
            set('et', c.edge.top);
            set('eb', c.edge.bottom);
            set('el', c.edge.left);
            set('er', c.edge.right);

            const st = {
                zoom: 1,
                m: {
                    mx: 0,
                    my: 0
                },
                zi: null
            };

            const m = st.m;

            this.mx = m.mx;
            this.my = m.my;

            this._setOut(
                m.mx > 0 &&
                this.width > 0 &&
                this.height > 0
            );

            if (this.out) {
                this.el.classList.add('lg-out');
            }

            set('mx', m.mx + 'px');
            set('my', m.my + 'px');
            set('r', this.radius + 'px');

            const amount = Number(
                c.refraction && c.refraction.amount
            ) || 0;

            this._buildPrimitives();

            if (this.dispG) {
                this.dispG.setAttribute(
                    'scale',
                    amount
                );
            }

            this._syncMap(st);

            set(
                'bf',
                this.width > 0 && this.height > 0
                    ? 'url(#' + this.filterId + ')'
                    : 'none'
            );

            return this;
        }

        refresh() {
            this._measure();
            return this.apply();
        }

        update(options) {
            merge(this.config, options);
            return this.refresh();
        }

        _observe() {
            if (typeof ResizeObserver === 'undefined') {
                return;
            }

            this._ro = new ResizeObserver(
                () => this._onResize()
            );

            this._ro.observe(this.el);
        }

        _onResize() {
            const w = this.el.offsetWidth;
            const h = this.el.offsetHeight;

            if (w === this.width && h === this.height) {
                return;
            }

            this._measure();

            if (
                !this.width ||
                !this.height ||
                !(this.mapKey || this.zmapKey)
            ) {
                this.apply();
                return;
            }

            const rm = {
                mx: 0,
                my: 0
            };

            this._sizeImgs(
                this.width + 2 * rm.mx,
                this.height + 2 * rm.my
            );

            clearTimeout(this._timer);

            this._timer = setTimeout(
                () => this.apply(),
                120
            );
        }

        destroy() {
            if (!this.el) return;

            clearTimeout(this._timer);

            if (this._ro) {
                this._ro.disconnect();
            }

            this._setOut(false);

            this.filter.remove();
            this.borderEl.remove();

            this.el.classList.remove('lg-glass');

            for (let i = 0; i < VARS.length; i++) {
                this.el.style.removeProperty(
                    '--lg-' + VARS[i]
                );
            }

            if (
                this._setPos &&
                this.el.style.position === 'relative'
            ) {
                this.el.style.position = '';
            }

            delete this.el._liquidGlass;

            this.el = null;

            count--;

            if (count <= 0 && defsSvg) {
                defsSvg.remove();

                defsSvg = null;
                defs = null;

                count = 0;
            }
        }

        static all(target, options) {
            const nodes = typeof target === 'string'
                ? document.querySelectorAll(target)
                : target;

            return Array.prototype.map.call(
                nodes,
                function (n) {
                    return new LiquidGlass(n, options);
                }
            );
        }
    }

    LiquidGlass.defaults = DEFAULTS;
    LiquidGlass.edition = 'Lite';

    LiquidGlass.features = Object.freeze([
        'solid-tint',
        'edge',
        'refraction'
    ]);

    return LiquidGlass;
});
