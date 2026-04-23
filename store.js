// store.js - Conexión con Firebase Firestore y Auth
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/**
 * CONFIGURACIÓN DE SEGURIDAD:
 * Para evitar alertas de GitHub, usaremos un sistema de respaldo.
 * Si las variables de entorno de Netlify no están listas, usará los valores de desarrollo.
 */
const firebaseConfig = {
  // Reemplazaremos estos valores en el panel de Netlify más adelante
  apiKey: window.KRYPTA_CONFIG?.API_KEY || "AIzaSyAEXkN-NVI5mcLbnMsYP94n8xrvUM1zDGA",
  authDomain: "krypta-vault.firebaseapp.com",
  projectId: "krypta-vault",
  storageBucket: "krypta-vault.firebasestorage.app",
  messagingSenderId: "16656947927",
  appId: "1:16656947927:web:898d7fd3345b00dc9cae92"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 

export { auth };

export const CloudStorage = {
    /**
     * Guarda el registro cifrado en la nube vinculado al UID de Firebase.
     */
    async save(userId, site, username, email, notes, cipher, iv) {
        if (!userId) return false;
        
        try {
            await addDoc(collection(db, "vault"), {
                userId,      // UID único de Firebase Auth
                site: site || 'Sin nombre',        
                username: username || '', 
                email: email || '',
                notes: notes || '',
                cipher,      
                iv,          
                serverTimestamp: Date.now() // Método más moderno para obtener el timestamp
            });
            return true;
        } catch (e) {
            console.error("Krypta Cloud: Error al sincronizar:", e);
            return false;
        }
    },

    /**
     * Recupera todos los registros vinculados al UID del usuario actual.
     */
    async fetch(userId) {
        if (!userId) return [];

        try {
            const vaultRef = collection(db, "vault");
            
            // Consulta filtrada por usuario
            const q = query(
                vaultRef, 
                where("userId", "==", userId)
            );
            
            const querySnapshot = await getDocs(q);
            const results = [];
            
            querySnapshot.forEach((doc) => {
                results.push({ id: doc.id, ...doc.data() });
            });
            
            // Ordenamos localmente por el timestamp para evitar índices compuestos en Firebase
            return results.sort((a, b) => b.serverTimestamp - a.serverTimestamp);
        } catch (e) {
            console.error("Krypta Cloud: Error al obtener datos:", e);
            return [];
        }
    }
};