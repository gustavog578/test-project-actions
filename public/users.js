document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar la sesión antes de hacer nada (Igual que en dashboard)
    try {
        const sessionRes = await fetch('/api/check-session');
        const sessionData = await sessionRes.json();

        if (!sessionData.loggedIn) {
            window.location.href = '/'; // Redirigir a login si no está logueado
            return;
        }
    } catch (err) {
        console.error('Error verificando sesión:', err);
        window.location.href = '/';
        return;
    }

    // 2. Obtener y mostrar la lista de usuarios
    loadUsers();

    // 3. Configurar lógica del modal
    setupModal();
});

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/';
                return;
            }
            throw new Error(`Error en la petición: ${response.status}`);
        }

        const users = await response.json();
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = ''; // Limpiar previo

        users.forEach(user => {
            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            tdName.textContent = user.username;

            const tdAction = document.createElement('td');
            const btn = document.createElement('button');
            btn.className = 'btn-view';
            btn.textContent = 'Ver contraseña';
            btn.onclick = () => showPasswordModal(user.username, user.password);

            tdAction.appendChild(btn);

            tr.appendChild(tdName);
            tr.appendChild(tdAction);
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error cargando usuarios:', err);
        document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="2">Error cargando usuarios.</td></tr>';
    }
}

function setupModal() {
    const modal = document.getElementById('passwordModal');
    const span = document.getElementsByClassName('close')[0];

    // Cuando pulsa la X
    span.onclick = function () {
        modal.style.display = 'none';
        document.getElementById('modalPassword').textContent = '';
    }

    // Cuando pulsa fuera del modal
    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = 'none';
            document.getElementById('modalPassword').textContent = '';
        }
    }
}

function showPasswordModal(username, password) {
    document.getElementById('modalUsername').textContent = `Usuario: ${username}`;
    document.getElementById('modalPassword').textContent = password;
    document.getElementById('passwordModal').style.display = 'block';
}
