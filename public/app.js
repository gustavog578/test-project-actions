document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    const logoutBtn = document.getElementById('logoutBtn');
    const welcomeUser = document.getElementById('welcomeUser');

    // Check session on load
    const checkSession = async () => {
        try {
            const res = await fetch('/api/check-session');
            const data = await res.json();

            const isDashboard = window.location.pathname.includes('dashboard.html');
            const isIndex = window.location.pathname.includes('index.html') || window.location.pathname === '/';

            if (data.loggedIn) {
                if (isIndex) {
                    window.location.href = '/dashboard.html';
                }
                if (welcomeUser) {
                    welcomeUser.textContent = data.username;
                }
            } else {
                if (isDashboard) {
                    window.location.href = '/index.html';
                }
            }
        } catch (err) {
            console.error('Session check failed', err);
        }
    };

    checkSession();

    // Login logic
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;

            loginBtn.disabled = true;
            loginBtn.textContent = 'Signing in...';
            errorMessage.textContent = '';

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();

                if (data.success) {
                    window.location.href = '/dashboard.html';
                } else {
                    errorMessage.textContent = data.message || 'Login failed';
                }
            } catch (err) {
                errorMessage.textContent = 'An error occurred. Please try again.';
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
            }
        });
    }

    // Logout logic
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/logout');
                window.location.href = '/index.html';
            } catch (err) {
                console.error('Logout failed', err);
            }
        });
    }
});
