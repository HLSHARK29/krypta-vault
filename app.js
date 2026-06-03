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
let editingId = null; 
let cachedVault = []; 
let inactivityTimeout; 

// Selectores del DOM
const ui = {
    authScreen: document.getElementById('auth-screen'),
    regScreen: document.getElementById('register-screen'),
    vaultScreen: document.getElementById('vault-screen'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    credentialModal: document.getElementById('credential-modal'),
    
    loginUser: document.getElementById('login-username'),
    masterKeyInput: document.getElementById('master-key'),
    
    regEmail: document.getElementById('reg-email'),
    regMasterKey: document.getElementById('reg-master-key'),
    
    newSite: document.getElementById('new-site'),
    newUser: document.getElementById('new-user'),
    newEmail: document.getElementById('new-email'),
    newNotes: document.getElementById('new-notes'),
    newPass: document.getElementById('new-pass'),
    passMeter: document.getElementById('password-strength-meter'),
    strengthText: document.getElementById('strength-text'),
    badge: document.getElementById('excellent-badge'), 
    checkShowNewPass: document.getElementById('check-show-new-pass'),

    btnUnlock: document.getElementById('btn-unlock'),
    btnBiometric: document.getElementById('btn-biometric'),
    btnCreate: document.getElementById('btn-create-account'),
    btnLock: document.getElementById('status-indicator'),
    btnSaveNew: document.getElementById('btn-save-new'),
    btnConfirmSave: document.getElementById('btn-confirm-save'),
    btnCancelSave: document.getElementById('btn-cancel-save'),
    btnGenerate: document.getElementById('btn-generate-pass'),
    
    passwordList: document.getElementById('password-list'),
    goToRegister: document.getElementById('go-to-register'),
    goToLogin: document.getElementById('go-to-login'),

    vaultSearch: document.getElementById('vault-search'),
    sortSelect: document.getElementById('sort-select'),
    azSidebar: document.getElementById('az-sidebar')
};

// --- SEGURIDAD: INACTIVIDAD ---
function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    if (activeKey) { 
        inactivityTimeout = setTimeout(() => {
            handleAutoLock();
        }, 60000); 
    }
}

async function handleAutoLock() {
    activeKey = null;
    Auth.clearSession();
    await signOut(auth);
    alert("Sesión cerrada por inactividad.");
    location.reload();
}

['mousedown', 'touchstart', 'scroll', 'keypress', 'click'].forEach(event => {
    window.addEventListener(event, resetInactivityTimer, true);
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && activeKey) {
        handleAutoLock();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    
    const handleLoginEnter = (e) => {
        if (e.key === 'Enter') ui.btnUnlock.click();
    };
    ui.masterKeyInput.addEventListener('keypress', handleLoginEnter);
    ui.loginUser.addEventListener('keypress', handleLoginEnter);

    ui.vaultSearch.addEventListener('input', () => {
        const query = ui.vaultSearch.value.toLowerCase();
        const filtered = cachedVault.filter(item => 
            item.site.toLowerCase().includes(query) || 
            (item.username && item.username.toLowerCase().includes(query))
        );
        renderFilteredVault(filtered);
    });

    // AJUSTE: Guardar preferencia al cambiar el select
    ui.sortSelect.addEventListener('change', async () => {
        applySortAndRender();
        if (currentUser) {
            await CloudStorage.saveSetting(currentUser.id, 'preferredOrder', ui.sortSelect.value);
        }
    });

    document.body.addEventListener('change', (e) => {
        if (e.target.classList.contains('check-show-pass')) {
            const targetId = e.target.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                input.type = e.target.checked ? 'text' : 'password';
            }
        }
    });

    ui.newPass.addEventListener('input', () => {
        evaluateStrength(ui.newPass.value);
    });

    ui.btnGenerate.addEventListener('click', () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
        let retVal = "";
        for (let i = 0; i < 22; ++i) { 
            retVal += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        ui.newPass.value = retVal;
        ui.newPass.type = "text"; 
        ui.checkShowNewPass.checked = true;
        evaluateStrength(retVal);
    });

    ui.goToRegister.addEventListener('click', (e) => { e.preventDefault(); showScreen('register'); });
    ui.goToLogin.addEventListener('click', (e) => { e.preventDefault(); showScreen('auth'); });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = { id: user.uid, email: user.email };
            if (!activeKey) showScreen('auth');
        } else {
            showScreen('register');
        }
    });

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
                    alert("Primero inicia sesión con tu Master Key.");
                }
            } catch (e) {
                alert("Error al acceder al sensor biométrico.");
            }
        });
    }

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
            } catch (error) { alert("Error: " + error.message); }
        }
    });

    ui.btnUnlock.addEventListener('click', async () => {
        const email = ui.loginUser.value.trim();
        const pass = ui.masterKeyInput.value;
        if (!email || !pass) return alert("Ingresa tus credenciales.");
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            activeKey = await CryptoEngine.deriveKey(pass);
            await Auth.saveKey(activeKey);
            showVault();
        } catch (e) { alert("Clave o correo incorrectos."); }
    });

    ui.btnSaveNew.addEventListener('click', () => {
        editingId = null;
        ui.modalTitle.innerText = "Nueva Credencial";
        ui.modalOverlay.style.display = 'flex';
        evaluateStrength("");
    });

    ui.btnCancelSave.addEventListener('click', () => { 
        ui.modalOverlay.style.display = 'none'; 
        clearModalFields(); 
    });

    ui.btnConfirmSave.addEventListener('click', async () => {
        const data = {
            site: ui.newSite.value.trim() || "Sin Título",
            user: ui.newUser.value.trim(),
            email: ui.newEmail.value.trim(),
            notes: ui.newNotes.value.trim(),
            pass: ui.newPass.value
        };

        if (!data.pass) return alert("La contraseña es obligatoria.");
        ui.btnConfirmSave.disabled = true;
        ui.btnConfirmSave.innerText = "Sincronizando...";
        
        await processSave(data);

        ui.modalOverlay.style.display = 'none';
        ui.btnConfirmSave.disabled = false;
        ui.btnConfirmSave.innerText = "Guardar en Nube";
        clearModalFields();
        await renderVault();
    });

    ui.btnLock.addEventListener('click', async () => {
        if(confirm("¿Cerrar sesión de la bóveda?")) {
            activeKey = null;
            Auth.clearSession();
            await signOut(auth);
            location.reload(); 
        }
    });
});

/**
 * LÓGICA DE ORDENAMIENTO Y PERSISTENCIA
 */
function applySortAndRender() {
    const criteria = ui.sortSelect.value;
    let sortedData = [...cachedVault];

    if (criteria === 'alpha') {
        sortedData.sort((a, b) => a.site.localeCompare(b.site, undefined, { numeric: true, sensitivity: 'base' }));
    } else if (criteria === 'oldest') {
        // Orden por defecto de creación
    } else {
        sortedData.reverse(); 
    }

    renderFilteredVault(sortedData);
}

function renderAZSidebar(data) {
    ui.azSidebar.innerHTML = '';
    // Obtener letras únicas presentes en los datos
    const letters = [...new Set(data.map(item => item.site[0].toUpperCase()))].sort();
    
    letters.forEach(letter => {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'az-letter';
        link.innerText = letter;
        link.onclick = async (e) => {
            e.preventDefault();
            
            // AJUSTE: Si no está en orden alfabético, forzarlo para que el scroll sea preciso
            if (ui.sortSelect.value !== 'alpha') {
                ui.sortSelect.value = 'alpha';
                applySortAndRender();
                await CloudStorage.saveSetting(currentUser.id, 'preferredOrder', 'alpha');
            }

            const target = Array.from(ui.passwordList.children).find(card => 
                card.querySelector('.site-name')?.innerText[0].toUpperCase() === letter
            );
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        ui.azSidebar.appendChild(link);
    });
}

/**
 * UI & RENDERING
 */
function evaluateStrength(pass) {
    let score = 0;
    if (pass.length > 0) {
        if (pass.length >= 8) score++;
        if (pass.length >= 12) score++;
        if (/[A-Z]/.test(pass) && /[0-9]/.test(pass)) score++;
        if (/[^A-Za-z0-9]/.test(pass)) score++;
        if (pass.length >= 18) score++; 
    }

    const levels = ["meter-weak", "meter-medium", "meter-good", "meter-very-strong", "meter-excellent"];
    const labels = ["Muy Débil", "Media", "Buena", "Muy Fuerte", "Excelente"];
    
    ui.passMeter.innerHTML = '<div class="meter-bar"></div>';
    ui.passMeter.className = ""; 

    if (pass) {
        const index = Math.max(0, score - 1);
        ui.passMeter.classList.add(levels[index]);
        ui.strengthText.innerText = `Seguridad: ${labels[index]}`;
        ui.badge.style.display = (score >= 5) ? "inline-block" : "none";
    } else {
        ui.strengthText.innerText = "Nivel de seguridad";
        ui.badge.style.display = "none";
        ui.passMeter.innerHTML = ""; 
    }
}

async function processSave(data) {
    if (!activeKey || !currentUser) return;
    try {
        const encrypted = await CryptoEngine.encrypt(data.pass, activeKey);
        const payload = {
            userId: currentUser.id,
            site: data.site,
            username: data.user,
            email: data.email,
            notes: data.notes,
            cipher: encrypted.cipher,
            iv: encrypted.iv
        };

        if (editingId) {
            await CloudStorage.update(editingId, payload);
        } else {
            await CloudStorage.save(payload.userId, payload.site, payload.username, payload.email, payload.notes, payload.cipher, payload.iv);
        }
    } catch (e) { console.error("Error al procesar:", e); }
}

async function renderVault() {
    ui.passwordList.innerHTML = '<p class="empty-msg">Accediendo a la nube segura...</p>';
    cachedVault = await CloudStorage.fetch(currentUser.id);
    applySortAndRender();
}

async function renderFilteredVault(data) {
    ui.passwordList.innerHTML = '';

    if (data.length === 0) {
        ui.passwordList.innerHTML = '<p class="empty-msg">No se encontraron registros.</p>';
        return;
    }

    for (const item of data) {
        const card = document.createElement('div');
        card.className = 'password-card';
        try {
            const decrypted = await CryptoEngine.decrypt(item.cipher, item.iv, activeKey);
            const domain = item.site.includes('.') ? item.site : `${item.site}.com`;
            const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

            card.innerHTML = `
                <div class="card-header">
                    <img src="${iconUrl}" class="site-icon" onerror="this.style.display='none'" style="width:24px;height:24px;margin-right:10px;border-radius:4px;">
                    <div class="site-info">
                        <div class="site-name">${item.site}</div>
                        ${item.username ? `<div class="detail-row"><b>Usuario:</b> ${item.username}</div>` : ''}
                        ${item.email ? `<div class="detail-row"><b>Email:</b> ${item.email}</div>` : ''}
                    </div>
                    <button class="btn-mini copy-btn" title="Copiar Contraseña">
                        <span class="material-icons-round">content_copy</span>
                    </button>
                </div>
                ${item.notes ? `<div class="notes-preview">${item.notes}</div>` : ''}
                <div class="card-actions">
                    <button class="btn-mini edit-btn" title="Editar">
                        <span class="material-icons-round">edit</span>
                    </button>
                    <button class="btn-mini delete-btn" title="Eliminar">
                        <span class="material-icons-round">delete_outline</span>
                    </button>
                </div>
            `;
            
            card.querySelector('.edit-btn').onclick = () => prepareEdit(item, decrypted);
            card.querySelector('.delete-btn').onclick = () => deleteEntry(item.id, item.site);
            card.querySelector('.copy-btn').onclick = (e) => copyToClipboard(e, decrypted);

        } catch (e) {
            card.innerHTML = `<p class="error">Error de descifrado</p>`;
        }
        ui.passwordList.appendChild(card);
    }
    renderAZSidebar(data);
}

function prepareEdit(item, rawPass) {
    editingId = item.id;
    ui.modalTitle.innerText = "Editar Credencial";
    ui.newSite.value = item.site;
    ui.newUser.value = item.username || "";
    ui.newEmail.value = item.email || "";
    ui.newNotes.value = item.notes || "";
    ui.newPass.value = rawPass;
    ui.modalOverlay.style.display = 'flex';
    evaluateStrength(rawPass);
}

async function deleteEntry(id, site) {
    if (confirm(`¿Eliminar permanentemente "${site}"?`)) {
        try {
            await CloudStorage.delete(id);
            cachedVault = cachedVault.filter(item => item.id !== id);
            applySortAndRender();
        } catch (e) {
            alert("Error al intentar eliminar el registro.");
        }
    }
}

function copyToClipboard(e, text) {
    const btn = e.currentTarget;
    navigator.clipboard.writeText(text);
    const icon = btn.querySelector('.material-icons-round');
    icon.textContent = 'check';
    icon.style.color = '#00ff88';
    setTimeout(() => {
        icon.textContent = 'content_copy';
        icon.style.color = '';
    }, 1500);
}

function showScreen(screen) {
    ui.authScreen.style.display = screen === 'auth' ? 'block' : 'none';
    ui.regScreen.style.display = screen === 'register' ? 'block' : 'none';
    ui.vaultScreen.style.display = screen === 'vault' ? 'block' : 'none';
}

function clearModalFields() {
    [ui.newSite, ui.newUser, ui.newEmail, ui.newNotes, ui.newPass].forEach(el => el.value = '');
    ui.checkShowNewPass.checked = false;
    ui.newPass.type = "password";
    ui.passMeter.innerHTML = "";
    ui.badge.style.display = "none";
    ui.strengthText.innerText = "Nivel de seguridad";
}

async function showVault() {
    showScreen('vault');
    ui.btnLock.innerHTML = '<span class="material-icons-round">lock_open</span>';
    
    // AJUSTE: Cargar preferencia de orden al iniciar
    const savedOrder = await CloudStorage.getSetting(currentUser.id, 'preferredOrder');
    if (savedOrder) {
        ui.sortSelect.value = savedOrder;
    }

    if (CloudStorage.listen) {
        CloudStorage.listen(currentUser.id, (newData) => {
            cachedVault = newData;
            applySortAndRender();
        });
    } else {
        renderVault();
    }
    resetInactivityTimer();
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}