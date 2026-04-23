import { auth, CloudStorage } from './store.js';
import { CryptoEngine } from './crypto.js';
import { Auth } from './auth.js'; 
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Estado global de la aplicación (RAM)
let activeKey = null;
let currentUser = null;

// Selectores del DOM
const ui = {
    authScreen: document.getElementById('auth-screen'),
    regScreen: document.getElementById('register-screen'),
    vaultScreen: document.getElementById('vault-screen'),
    modalOverlay: document.getElementById('modal-overlay'),
    
    loginUser: document.getElementById('login-username'),
    masterKeyInput: document.getElementById('master-key'),
    
    regEmail: document.getElementById('reg-email'),
    regMasterKey: document.getElementById('reg-master-key'),
    
    newSite: document.getElementById('new-site'),
    newUser: document.getElementById('new-user'),
    newEmail: document.getElementById('new-email'),
    newNotes: document.getElementById('new-notes'),
    newPass: document.getElementById('new-pass'),

    btnUnlock: document.getElementById('btn-unlock'),
    btnBiometric: document.getElementById('btn-biometric'),
    btnCreate: document.getElementById('btn-create-account'),
    btnLock: document.getElementById('status-indicator'),
    btnSaveNew: document.getElementById('btn-save-new'),
    btnConfirmSave: document.getElementById('btn-confirm-save'),
    btnCancelSave: document.getElementById('btn-cancel-save'),
    
    passwordList: document.getElementById('password-list'),
    goToRegister: document.getElementById('go-to-register'),
    goToLogin: document.getElementById('go-to-login')
};

document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. Lógica de Checkbox para Visibilidad ---
    document.body.addEventListener('change', (e) => {
        if (e.target.classList.contains('check-show-pass')) {
            const targetId = e.target.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                input.type = e.target.checked ? 'text' : 'password';
            }
        }
    });

    // --- 2. Navegación ---
    ui.goToRegister.addEventListener('click', (e) => { e.preventDefault(); showScreen('register'); });
    ui.goToLogin.addEventListener('click', (e) => { e.preventDefault(); showScreen('auth'); });

    // --- 3. Persistencia de Sesión Firebase ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = { id: user.uid, email: user.email };
            // Si el usuario vuelve y no tenemos la llave activa, intentamos biometría o pedimos Master Key
            if (!activeKey) showScreen('auth');
        } else {
            showScreen('register');
        }
    });

    // --- 4. Soporte Biométrico Nativo ---
    const hasBiometrics = await Auth.checkSupport();
    if (!hasBiometrics) {
        ui.btnBiometric.style.display = 'none';
    } else {
        ui.btnBiometric.addEventListener('click', async () => {
            try {
                const recoveredKey = await Auth.getSavedKey(); 
                if (recoveredKey) {
                    activeKey = recoveredKey;
                    showVault();
                } else {
                    alert("Primero inicia sesión con tu Master Key para activar la biometría.");
                }
            } catch (e) {
                console.error("Error en sensor nativo:", e);
                alert("Error al acceder al sensor biométrico.");
            }
        });
    }

    // --- 5. Registro ---
    ui.btnCreate.addEventListener('click', async () => {
        const email = ui.regEmail.value.trim();
        const pass = ui.regMasterKey.value;
        
        if (email && pass.length >= 8) {
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
                currentUser = { id: userCredential.user.uid, email: email };
                activeKey = await CryptoEngine.deriveKey(pass);
                
                await Auth.saveKey(activeKey);
                showVault();
            } catch (error) { 
                alert("Error: " + error.message); 
            }
        } else {
            alert("La contraseña debe tener al menos 8 caracteres.");
        }
    });

    // --- 6. Login Manual ---
    ui.btnUnlock.addEventListener('click', async () => {
        const email = ui.loginUser.value.trim();
        const pass = ui.masterKeyInput.value;

        if (!email || !pass) return alert("Ingresa tus credenciales.");

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            activeKey = await CryptoEngine.deriveKey(pass);
            
            await Auth.saveKey(activeKey);
            showVault();
        } catch (e) { 
            alert("Clave o correo incorrectos."); 
        }
    });

    // --- 7. Gestión del Modal ---
    ui.btnSaveNew.addEventListener('click', () => { ui.modalOverlay.style.display = 'flex'; });
    ui.btnCancelSave.addEventListener('click', () => { 
        ui.modalOverlay.style.display = 'none'; 
        clearModalFields(); 
    });

    ui.btnConfirmSave.addEventListener('click', async () => {
        const data = {
            site: ui.newSite.value.trim(),
            user: ui.newUser.value.trim(),
            email: ui.newEmail.value.trim(),
            notes: ui.newNotes.value.trim(),
            pass: ui.newPass.value
        };

        if (data.site && data.pass) {
            ui.btnConfirmSave.disabled = true;
            ui.btnConfirmSave.innerText = "Sincronizando...";
            await saveCredential(data);
            ui.modalOverlay.style.display = 'none';
            ui.btnConfirmSave.disabled = false;
            ui.btnConfirmSave.innerText = "Guardar en Nube";
            clearModalFields();
            await renderVault(); // Forzamos actualización tras guardar
        } else {
            alert("El sitio y la contraseña son obligatorios.");
        }
    });

    // --- 8. Cierre de Bóveda ---
    ui.btnLock.addEventListener('click', async () => {
        if(confirm("¿Cerrar sesión de la bóveda?")) {
            activeKey = null;
            Auth.clearSession(); // Limpiamos también la llave biométrica
            await signOut(auth);
            location.reload(); 
        }
    });
});

// --- Funciones de Utilidad ---

function showScreen(screen) {
    ui.authScreen.style.display = screen === 'auth' ? 'block' : 'none';
    ui.regScreen.style.display = screen === 'register' ? 'block' : 'none';
    ui.vaultScreen.style.display = screen === 'vault' ? 'block' : 'none';
}

function clearModalFields() {
    [ui.newSite, ui.newUser, ui.newEmail, ui.newNotes, ui.newPass].forEach(el => el.value = '');
}

async function saveCredential(data) {
    if (!activeKey || !currentUser) return;
    try {
        const encryptedPass = await CryptoEngine.encrypt(data.pass, activeKey);
        await CloudStorage.save(
            currentUser.id, 
            data.site, 
            data.user, 
            data.email, 
            data.notes, 
            encryptedPass.cipher, 
            encryptedPass.iv
        );
    } catch (e) { console.error("Error al guardar:", e); }
}

async function renderVault() {
    ui.passwordList.innerHTML = '<p class="empty-msg">Accediendo a la nube segura...</p>';
    const userVault = await CloudStorage.fetch(currentUser.id);

    ui.passwordList.innerHTML = '';
    if (userVault.length === 0) {
        ui.passwordList.innerHTML = '<p class="empty-msg">Tu bóveda está vacía.</p>';
        return;
    }

    // Usamos for...of para manejar correctamente las promesas asíncronas de descifrado
    for (const item of userVault) {
        const card = document.createElement('div');
        card.className = 'password-card';
        try {
            const decrypted = await CryptoEngine.decrypt(item.cipher, item.iv, activeKey);
            card.innerHTML = `
                <div class="info">
                    <div class="site-name">${item.site}</div>
                    ${item.username ? `<div class="detail-row"><b>Usuario:</b> ${item.username}</div>` : ''}
                    ${item.email ? `<div class="detail-row"><b>Email:</b> ${item.email}</div>` : ''}
                    ${item.notes ? `<div class="notes-preview">${item.notes}</div>` : ''}
                    <div class="pass-value">••••••••</div>
                </div>
                <div class="card-actions">
                    <button class="primary copy-btn" data-pass="${decrypted}">
                        <span class="material-icons-round">content_copy</span>
                    </button>
                </div>
            `;
        } catch (e) {
            card.innerHTML = `<div class="info"><p class="error">Error: Llave Maestra no coincide.</p></div>`;
        }
        ui.passwordList.appendChild(card);
    }
    setupCardActions(); 
}

function setupCardActions() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(btn.dataset.pass);
            const icon = btn.querySelector('.material-icons-round');
            icon.textContent = 'check';
            icon.style.color = '#00ff88'; // Tu verde de éxito
            setTimeout(() => {
                icon.textContent = 'content_copy';
                icon.style.color = '';
            }, 1500);
        };
    });
}

function showVault() {
    showScreen('vault');
    ui.btnLock.classList.remove('locked');
    ui.btnLock.classList.add('unlocked');
    ui.btnLock.innerHTML = '<span class="material-icons-round">lock_open</span>';
    renderVault();
}

// --- 9. Registro del Service Worker (PWA) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Krypta PWA: Registrada'))
            .catch(err => console.error('Krypta PWA: Fallo', err));
    });
}