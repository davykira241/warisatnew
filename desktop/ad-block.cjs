const AD_HOSTS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.com',
    'adnxs.com',
    'pubmatic.com',
    'openx.net',
    'rubiconproject.com',
    'criteo.com',
    'taboola.com',
    'outbrain.com'
];

function isBlockedAdUrl(value) {
    try {
        const hostname = new URL(value).hostname.toLowerCase();
        return AD_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
}

module.exports = { isBlockedAdUrl };
