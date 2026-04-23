/**
 * crypto.js - Motor de cifrado AES-256 para Krypta
 */

export const CryptoEngine = {
    // Configuraciones de seguridad de grado industrial
    iterations: 100000,
    hash: 'SHA-256',
    algorithm: 'AES-GCM',

    /**
     * 1. Derivar una clave criptográfica (AES-256) a partir de la Contraseña Maestra.
     */
    async deriveKey(masterPassword) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(masterPassword);
        
        // Salt estático para esta versión.
        const salt = encoder.encode('krypta-hardened-salt-v1'); 

        const baseKey = await crypto.subtle.importKey(
            'raw', 
            passwordBuffer, 
            'PBKDF2', 
            false, 
            ['deriveKey']
        );

        return await crypto.subtle.deriveKey(
            { 
                name: 'PBKDF2', 
                salt: salt, 
                iterations: this.iterations, 
                hash: this.hash 
            },
            baseKey,
            { 
                name: this.algorithm, 
                length: 256 
            },
            false,
            ['encrypt', 'decrypt']
        );
    },

    /**
     * 2. Cifrar texto plano.
     */
    async encrypt(plainText, key) {
        if (!plainText) return { cipher: '', iv: '' };
        
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12)); 
        
        const encrypted = await crypto.subtle.encrypt(
            { 
                name: this.algorithm, 
                iv: iv 
            },
            key,
            encoder.encode(plainText)
        );

        // Conversión segura a Base64 usando un buffer intermedio
        const cipherBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(encrypted)));
        const ivBase64 = btoa(String.fromCharCode.apply(null, iv));

        return {
            cipher: cipherBase64,
            iv: ivBase64
        };
    },

    /**
     * 3. Descifrar texto cifrado con manejo de errores mejorado.
     */
    async decrypt(cipherText, ivBase64, key) {
        if (!cipherText || !ivBase64) return '';
        
        try {
            // Conversión inversa de Base64 a Uint8Array
            const iv = new Uint8Array(atob(ivBase64).split("").map(c => c.charCodeAt(0)));
            const data = new Uint8Array(atob(cipherText).split("").map(c => c.charCodeAt(0)));

            const decrypted = await crypto.subtle.decrypt(
                { 
                    name: this.algorithm, 
                    iv: iv 
                },
                key,
                data
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Krypta: Error en el descifrado:", e.message);
            // Error amigable para la UI
            throw new Error("Clave maestra incorrecta o datos corruptos.");
        }
    }
};