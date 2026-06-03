// store.js - Conexión con Firebase Firestore y Auth
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    doc, 
    getDoc,
    setDoc,
    updateDoc, 
    deleteDoc,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/**
 * CONFIGURACIÓN DE SEGURIDAD
 */
const firebaseConfig = {
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
     * NUEVO: Guarda preferencias del usuario (como el ordenamiento) en la nube.
     */
    async saveSetting(userId, key, value) {
        if (!userId) return;
        try {
            // Usamos setDoc con {merge: true} para que no borre otros ajustes si existieran
            const userRef = doc(db, "users", userId);
            await setDoc(userRef, { [key]: value }, { merge: true });
            return true;
        } catch (e) {
            console.error("Krypta Cloud: Error al guardar preferencia:", e);
            return false;
        }
    },

    /**
     * NUEVO: Recupera una preferencia específica del usuario desde Firestore.
     */
    async getSetting(userId, key) {
        if (!userId) return null;
        try {
            const userRef = doc(db, "users", userId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                return userSnap.data()[key] || null;
            }
            return null;
        } catch (e) {
            console.error("Krypta Cloud: Error al obtener preferencia:", e);
            return null;
        }
    },

    /**
     * Guarda el registro cifrado en la nube vinculado al UID de Firebase.
     */
    async save(userId, site, username, email, notes, cipher, iv) {
        if (!userId) return false;
        
        try {
            await addDoc(collection(db, "vault"), {
                userId,      
                site: site || 'Sin nombre',         
                username: username || '', 
                email: email || '',
                notes: notes || '',
                cipher,      
                iv,          
                serverTimestamp: Date.now() 
            });
            return true;
        } catch (e) {
            console.error("Krypta Cloud: Error al sincronizar:", e);
            return false;
        }
    },

    /**
     * Escucha cambios en tiempo real.
     */
    listen(userId, callback) {
        if (!userId) return;

        const vaultRef = collection(db, "vault");
        const q = query(vaultRef, where("userId", "==", userId));

        return onSnapshot(q, (querySnapshot) => {
            const results = [];
            querySnapshot.forEach((doc) => {
                results.push({ id: doc.id, ...doc.data() });
            });
            // Orden inicial por timestamp para la caché
            const sorted = results.sort((a, b) => b.serverTimestamp - a.serverTimestamp);
            callback(sorted);
        }, (e) => {
            console.error("Krypta Cloud: Error en tiempo real:", e);
        });
    },

    /**
     * Recupera todos los registros vinculados al UID del usuario actual.
     */
    async fetch(userId) {
        if (!userId) return [];

        try {
            const vaultRef = collection(db, "vault");
            const q = query(
                vaultRef, 
                where("userId", "==", userId)
            );
            
            const querySnapshot = await getDocs(q);
            const results = [];
            
            querySnapshot.forEach((doc) => {
                results.push({ id: doc.id, ...doc.data() });
            });
            
            return results.sort((a, b) => b.serverTimestamp - a.serverTimestamp);
        } catch (e) {
            console.error("Krypta Cloud: Error al obtener datos:", e);
            return [];
        }
    },

    /**
     * ACTUALIZAR: Modifica un registro existente.
     */
    async update(docId, data) {
        if (!docId) return false;
        try {
            const docRef = doc(db, "vault", docId);
            await updateDoc(docRef, {
                ...data,
                serverTimestamp: Date.now()
            });
            return true;
        } catch (e) {
            console.error("Krypta Cloud: Error al actualizar:", e);
            return false;
        }
    },

    /**
     * ELIMINAR: Borra un registro de la base de datos.
     */
    async delete(docId) {
        if (!docId) return false;
        try {
            const docRef = doc(db, "vault", docId);
            await deleteDoc(docRef);
            return true;
        } catch (e) {
            console.error("Krypta Cloud: Error al eliminar:", e);
            return false;
        }
    }
};