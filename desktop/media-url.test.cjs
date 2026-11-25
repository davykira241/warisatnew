const test = require('node:test');
const assert = require('node:assert/strict');
const { isDirectMediaUrl, normalizeHttpUrl } = require('./media-url.cjs');

test('only accepts HTTP and HTTPS URLs', () => {
    assert.equal(normalizeHttpUrl('https://video.example/live.m3u8'), 'https://video.example/live.m3u8');
    assert.equal(normalizeHttpUrl('file:///etc/passwd'), null);
    assert.equal(normalizeHttpUrl('javascript:alert(1)'), null);
    assert.equal(normalizeHttpUrl('not a url'), null);
});

test('detects direct video URLs with signed query strings', () => {
    assert.equal(isDirectMediaUrl('https://video.example/movie.mp4?token=abc'), true);
    assert.equal(isDirectMediaUrl('https://video.example/live.m3u8'), true);
    assert.equal(isDirectMediaUrl('https://video.example/watch?id=123'), false);
});
