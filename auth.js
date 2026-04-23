/**
 * auth.js - Gestión de biometría nativa (WebAuthn) y persistencia para Krypta
 */

export const Auth = {
    // 1. Verificar si el dispositivo tiene hardware biométrico disponible
    async checkSupport() {
        if (window.PublicKeyCredential) {
            try {
                return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            } catch (e) {
                return false;
            }
        }
        return false;
    },

    // 2. Guardar la llave tras el login exitoso con contraseña maestra
    async saveKey(cryptoKey) {
        try {
            const exported = await crypto.subtle.exportKey("raw", cryptoKey);
            // Uso de .apply para evitar errores de stack en la conversión binaria
            const base64Key = btoa(String.fromCharCode.apply(null, new Uint8Array(exported)));
            
            // Guardamos la llave en el almacenamiento local seguro
            localStorage.setItem('krypta_session_key', base64Key);
            return true;
        } catch (e) {
            console.error("Krypta: Error al persistir llave:", e);
            return false;
        }
    },

    // 3. Recuperar la llave disparando el sensor de huella/cara
    async getSavedKey() {
        const savedBase64 = localStorage.getItem('krypta_session_key');
        if (!savedBase64) return null;

        // Disparamos la autenticación nativa del SO
        const confirmed = await this.authenticate();
        
        if (confirmed) {
            try {
                // Decodificación robusta de Base64 a Uint8Array
                const binaryString = atob(savedBase64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                return await crypto.subtle.importKey(
                    "raw",
                    bytes,
                    { name: "AES-GCM" },
                    false,
                    ["encrypt", "decrypt"]
                );
            } catch (e) {
                console.error("Krypta: Error al re-importar llave:", e);
                return null;
            }
        }
        return null;
    },

    // 4. Invocación del sensor REAL del dispositivo (WebAuthn API)
    async authenticate() {
        try {
            const isSupported = await this.checkSupport();
            if (!isSupported) {
                console.warn("Krypta: Hardware biométrico no detectado.");
                return false;
            }

            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            // Ajuste de seguridad: rpId dinámico que ignora "localhost" si es necesario
            const currentHostname = window.location.hostname;

            const authOptions = {
                publicKey: {
                    challenge: challenge,
                    timeout: 60000,
                    userVerification: "required", 
                    // El rpId es estricto; si usas localhost debe omitirse o ser exacto
                    rpId: currentHostname === "localhost" ? undefined : currentHostname,
                    allowCredentials: [] 
                }
            };

            await navigator.credentials.get(authOptions);
            return true;
        } catch (error) {
            console.warn("Krypta: Autenticación biométrica cancelada o fallida.");
            return false;
        }
    },

    // 5. Borrar la sesión (Cierre total de seguridad)
    clearSession() {
        localStorage.removeItem('krypta_session_key');
    }
};