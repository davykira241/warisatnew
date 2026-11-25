const VIDEO_EXTENSIONS = /\.(?:m3u8|mpd|mp4|m4v|mkv|webm|mov|avi|ts|m2ts)$/i;

function normalizeHttpUrl(value) {
    if (typeof value !== 'string' || value.length > 8192) return null;

    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

function isDirectMediaUrl(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return false;
    return VIDEO_EXTENSIONS.test(new URL(normalized).pathname);
}

module.exports = { isDirectMediaUrl, normalizeHttpUrl };
