document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar la sesión y redireccionar si no existe
    try {
        const sessionRes = await fetch('/api/check-session');
        const sessionData = await sessionRes.json();

        if (!sessionData.loggedIn) {
            window.location.href = '/';
            return;
        }
    } catch (err) {
        console.error('Error verificando sesión:', err);
        window.location.href = '/';
        return;
    }

    // 2. Fetch profile data
    loadProfile();
});

async function loadProfile() {
    try {
        const response = await fetch('/api/profile');

        if (!response.ok) {
            if (response.status === 401 || response.status === 404) {
                window.location.href = '/';
                return;
            }
            throw new Error(`Error loading profile: ${response.status}`);
        }

        const profileData = await response.json();

        // Update UI
        document.getElementById('profileUsername').textContent = profileData.username;

        // Create an avatar initial
        if (profileData.username && profileData.username.length > 0) {
            document.getElementById('profileAvatar').textContent = profileData.username.charAt(0).toUpperCase();
        }

    } catch (err) {
        console.error('Error cargando perfil:', err);
        document.getElementById('profileUsername').textContent = 'Error cargando datos';
    }
}
