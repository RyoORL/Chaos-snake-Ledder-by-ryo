const PRODUCTION_SERVER = 'https://chaos-snake-ledder-by-ryo.onrender.com';
window.SERVER_URL = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000' : PRODUCTION_SERVER;
