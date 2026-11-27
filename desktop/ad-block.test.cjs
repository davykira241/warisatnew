const test = require('node:test');
const assert = require('node:assert/strict');
const { isBlockedAdUrl } = require('./ad-block.cjs');

test('blocks known ad domains and their subdomains', () => {
    assert.equal(isBlockedAdUrl('https://doubleclick.net/ads.js'), true);
    assert.equal(isBlockedAdUrl('https://secure.pubmatic.com/request'), true);
});

test('does not block unrelated or deceptive hostnames', () => {
    assert.equal(isBlockedAdUrl('https://video.example/watch'), false);
    assert.equal(isBlockedAdUrl('https://doubleclick.net.example.org/ads.js'), false);
    assert.equal(isBlockedAdUrl('not a url'), false);
});
