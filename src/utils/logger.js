import crypto from 'crypto';

function normalizeLevel(level) {
    const value = String(level || 'info').toLowerCase();
    if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') return value;
    return 'info';
}

const levelOrder = { debug: 10, info: 20, warn: 30, error: 40 };

function shouldLog(currentLevel, messageLevel) {
    return levelOrder[messageLevel] >= levelOrder[currentLevel];
}

function safeString(value, maxLen = 4096) {
    if (value === null || value === undefined) return value;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '…';
}

function redactObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const lowerRedactKeys = new Set([
        'authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
        'api-key',
        'openai_api_key',
        'groq_api_key',
        'privatekey',
        'private_key',
        'mnemonic',
        'seed',
        'secret',
        'token'
    ]);

    const result = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
        const lower = String(k).toLowerCase();
        if (lowerRedactKeys.has(lower)) {
            result[k] = '[REDACTED]';
            continue;
        }
        if (v && typeof v === 'object') {
            result[k] = redactObject(v);
            continue;
        }
        result[k] = v;
    }
    return result;
}

export function createLogger(options = {}) {
    const service = options.service || 'yieldkernel';
    const env = options.env || process.env.NODE_ENV || 'development';
    const level = normalizeLevel(options.level || process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug'));
    const format = String(options.format || process.env.LOG_FORMAT || (env === 'production' ? 'json' : 'pretty')).toLowerCase();
    const base = redactObject(options.base || {});

    function emit(messageLevel, message, fields = {}) {
        if (!shouldLog(level, messageLevel)) return;

        const payload = {
            ts: new Date().toISOString(),
            level: messageLevel,
            service,
            env,
            msg: safeString(message, 8192),
            ...base,
            ...redactObject(fields)
        };

        if (format === 'pretty') {
            const { ts, level: lvl, msg, ...rest } = payload;
            const head = `${ts} ${lvl.toUpperCase()} ${service}`;
            const tail = Object.keys(rest).length ? ` ${safeString(rest)}` : '';
            console.log(`${head} ${msg}${tail}`);
            return;
        }

        console.log(JSON.stringify(payload));
    }

    const logger = {
        child(extra = {}) {
            return createLogger({ service, env, level, format, base: { ...base, ...redactObject(extra) } });
        },
        debug(message, fields) {
            emit('debug', message, fields);
        },
        info(message, fields) {
            emit('info', message, fields);
        },
        warn(message, fields) {
            emit('warn', message, fields);
        },
        error(message, fields) {
            emit('error', message, fields);
        }
    };

    return logger;
}

export function createRequestId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
}

export function requestLoggingMiddleware(logger) {
    return function requestLogging(req, res, next) {
        const requestId = req.headers['x-request-id'] || createRequestId();
        req.requestId = String(requestId);
        res.setHeader('x-request-id', req.requestId);

        const reqLogger = logger.child({ requestId: req.requestId });
        req.log = reqLogger;

        const startNs = process.hrtime.bigint();
        const requestMeta = {
            method: req.method,
            path: req.originalUrl || req.url,
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        reqLogger.info('http.request', requestMeta);

        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
            reqLogger.info('http.response', {
                ...requestMeta,
                status: res.statusCode,
                durationMs: Number(durationMs.toFixed(2))
            });
        });

        next();
    };
}

export function errorLoggingMiddleware(logger) {
    return function errorLogging(err, req, res, next) {
        const reqLogger = req?.log || logger;
        reqLogger.error('http.error', {
            method: req?.method,
            path: req?.originalUrl || req?.url,
            status: res?.statusCode,
            error: {
                name: err?.name,
                message: err?.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack
            }
        });

        if (res.headersSent) return;
        res.status(500).json({ error: 'internal_error', requestId: req?.requestId });
    };
}
