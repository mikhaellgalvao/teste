/**
 * ==========================================
 * 1. CONFIGURAÇÃO (CONSTANTS) & DADOS DE FALLBACK
 * ==========================================
 */
const Config = {
    contacts: { central: "6236360668", mikhaell: "62984710639", maikhon: "62933001865", ryan: "62920007396" },
    centralNumber: "6236360668",
    installmentRates: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
    driveLinks: {
        "postados": "https://drive.google.com/drive/folders/1M_Dlzje4DVjbzD9p0awi-vIvwP6OXvF1",
        "postar": "https://drive.google.com/drive/folders/1m3ECb1lAIB4P1d1jZ8QdrtyE6CUO4M6T",
        "editar": "https://drive.google.com/drive/folders/195aWrPx89P9EIUK7PEL4Vj-6BMXVeVnY"
    },
    adminPassCode: "0639"
};

const FallbackData = {
    users: [
        { name: "Mikhaell Galvão", username: "mikhaell", password: "mk0639", role: "Administrador", phone: "62984710639", city: "Goiânia - GO", address: "Av. T-9, Jardim América", avatar: "https://i.imgur.com/ViDcChZ.jpeg" },
        { name: "Maikhon Galvão", username: "maikhon", password: "0639", role: "Administrador", phone: "62933001865", city: "Goiânia - GO", address: "Av. T-9, Jardim América", avatar: "https://i.imgur.com/49xvSy4.jpeg" },
        { name: "Robert Maia", username: "robert", password: "5856", role: "Vendas externa", phone: "94981530223", city: "Marabá - PA", address: "Centro", avatar: "" },
        { name: "Visitante", username: "consultas", password: "", role: "Visitante", phone: "6236360668", city: "Acesso Remoto", address: "Online", avatar: "" }
    ],
    products: [
        { id: 1000, name: "Drone DJI Neo 2 Standard (Sem Controle)", cost: "1.660,00", sell: "2.324,00", icon: "🛸", type: "Equipamentos", line: "Consumer" },
        { id: 1001, name: "Drone Dji Neo 2 Fly More Combo (Sem controle)", cost: "2.300,00", sell: "3.220,00", icon: "🛸", type: "Equipamentos", line: "Consumer" },
        { id: 1003, name: "Drone Dji Mini 3 Standard (Sem tela)", cost: "2.700,00", sell: "3.780,00", icon: "🛸", type: "Equipamentos", line: "Consumer" },
        { id: 1009, name: "Drone Dji Mini 4 Pro Standard (com tela)", cost: "6.150,00", sell: "8.610,00", icon: "🛸", type: "Equipamentos", line: "Consumer" }
    ],
    used: [
        { name: "Mavic 3 Pro", price: "14.000,00", condition: "Seminovo", images: ["https://imgur.com/2PNy5CS.png"], details: { batteries: [12, 15, 14] }, desc: "Aparelho impecável, nunca caiu." }
    ],
    marketing: [
        { title: "Logo Vetor (SVG)", type: "Logo", preview: "https://imgur.com/ny5U9KV.png", downloadUrl: "assets/logo.svg" }
    ]
};

const Utils = {
    fmtBRL: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    cleanCurrency: (val) => parseFloat((val || "0").toString().replace(/\./g, '').replace(',', '.')),
    toggleTheme: () => document.documentElement.classList.toggle('dark'),
    reload: () => {
        // CORREÇÃO DO LOGOUT: Limpa o cache de login antes de recarregar
        localStorage.removeItem('gd_user');
        localStorage.removeItem('gd_pass');
        location.reload();
    },
    wait: (ms) => new Promise(r => setTimeout(r, ms))
};

/**
 * ==========================================
 * 2. GERENCIAMENTO DE ESTADO (STORE)
 * ==========================================
 */
class Store {
    constructor() {
        this.state = {
            currentUser: null,
            users: [],
            products: [],
            usedProducts: [],
            marketingAssets: [],
            adminSession: false,
            isLocked: false,
            loginAttempts: 0,
            currentProduct: "",
            currentShareProduct: { name: "", price: 0 },
            shareMode: 'vista',
            adminEdit: { type: null, index: null },
            currentUsedIdx: null,
            deleteTarget: null,
            intervals: []
        };
    }

    setUser(user) { this.state.currentUser = user; }
    setAdminSession(isActive) { this.state.adminSession = isActive; }

    async loadData() {
        try {
            console.log("🛰️ Ativando Sincronização em Tempo Real...");
            
            const usersRef = window.Firestore.collection(window.db, 'users');
            const productsRef = window.Firestore.collection(window.db, 'products');
            const usedRef = window.Firestore.collection(window.db, 'used');

            // ESCUTA EM TEMPO REAL (onSnapshot)
            window.Firestore.onSnapshot(productsRef, (snapshot) => {
                this.state.products = snapshot.docs.map(d => ({ ...d.data(), fireId: d.id }));
                console.log("🔄 Produtos atualizados da nuvem!");
                if(document.getElementById('page-title')?.textContent === 'CONSULTAS') App.navigate('consultas');
            });

            window.Firestore.onSnapshot(usersRef, (snapshot) => {
                this.state.users = snapshot.docs.map(d => ({ ...d.data(), fireId: d.id }));
                if (snapshot.empty) {
                    this._migrateToCloud(usersRef, FallbackData.users);
                }
            });

            window.Firestore.onSnapshot(usedRef, (snapshot) => {
                this.state.usedProducts = snapshot.docs.map(d => ({ ...d.data(), fireId: d.id }));
                if(document.getElementById('page-title')?.textContent === 'SEMINOVOS') App.navigate('usados');
            });

            this.state.marketingAssets = this._normalizeMarketing(FallbackData.marketing);
            
        } catch (e) {
            console.error("❌ Erro Cloud. Usando modo segurança.", e);
            this.state.users = FallbackData.users;
            this.state.products = FallbackData.products;
            this.state.usedProducts = FallbackData.used;
        }
    }

    async _migrateToCloud(collectionRef, dataArray) {
        const batch = window.Firestore.writeBatch(window.db);
        dataArray.forEach(item => {
            const docRef = window.Firestore.doc(collectionRef);
            batch.set(docRef, item);
        });
        await batch.commit();
    }

    async addItem(type, item) {
        const colMap = { 'user': 'users', 'product': 'products', 'used': 'used' };
        try {
            await window.Firestore.addDoc(window.Firestore.collection(window.db, colMap[type]), item);
        } catch (e) { console.error("Erro ao salvar:", e); }
    }

    async updateItem(type, index, item) {
        const colMap = { 'user': 'users', 'product': 'products', 'used': 'used' };
        const stateKey = type === 'user' ? 'users' : type === 'product' ? 'products' : 'usedProducts';
        const oldItem = this.state[stateKey][index];
        if (oldItem.fireId) {
            try {
                await window.Firestore.updateDoc(window.Firestore.doc(window.db, colMap[type], oldItem.fireId), item);
            } catch (e) { console.error("Erro ao atualizar:", e); }
        }
    }

    async deleteItem(type, index) {
        const colMap = { 'user': 'users', 'product': 'products', 'used': 'used' };
        const stateKey = type === 'user' ? 'users' : type === 'product' ? 'products' : 'usedProducts';
        const item = this.state[stateKey][index];
        if (item.fireId) {
            try {
                await window.Firestore.deleteDoc(window.Firestore.doc(window.db, colMap[type], item.fireId));
            } catch (e) { console.error("Erro ao deletar:", e); }
        }
    }

    _normalizeMarketing(assets) {
        return assets ? assets.map(a => (!a.variations && a.downloadUrl) ? { ...a, variations: [{ name: 'Padrão', url: a.downloadUrl }] } : a) : [];
    }
}

const appStore = new Store();

/**
 * ==========================================
 * 3. SERVIÇOS (Auth)
 * ==========================================
 */
class AuthService {
    static async login(username, password) {
        if (appStore.state.isLocked) return { success: false, msg: "Bloqueado temporariamente." };
        const user = appStore.state.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        if (user) {
            appStore.setUser(user);
            appStore.state.loginAttempts = 0;
            return { success: true };
        } else {
            appStore.state.loginAttempts++;
            if (appStore.state.loginAttempts >= 3) {
                appStore.state.isLocked = true;
                setTimeout(() => appStore.state.isLocked = false, 30000);
            }
            return { success: false, msg: "Credenciais Inválidas" };
        }
    }
    static canAccess(f) {
        const r = appStore.state.currentUser?.role;
        if (r === 'Administrador') return true;
        if (f === 'admin') return false;
        return true;
    }
}

/**
 * ==========================================
 * 4. TEMPLATES & VIEW RENDERER
 * ==========================================
 */
const Templates = {
    login: () => `
        <div class="min-h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-black relative overflow-hidden">
            <div class="absolute inset-0 z-0 opacity-10" style="background-image: url('https://imgur.com/2PNy5CS.png'); background-size: cover; filter: blur(20px);"></div>
            <div class="bg-white dark:bg-zinc-900 w-full max-w-md p-8 rounded-[2.5rem] shadow-2xl border dark:border-zinc-800 relative z-10 fade-in">
                <div class="flex justify-center mb-8"><div id="login-logo-trigger" class="w-24 h-24 bg-gray-50 dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-inner cursor-pointer active:scale-95 transition-transform"><img src="https://imgur.com/ny5U9KV.png" class="w-16 h-16 object-contain"></div></div>
                <h2 class="text-center text-2xl font-black text-brand-green dark:text-white uppercase italic tracking-tighter mb-1">Galvão Drones</h2>
                <p class="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8">Portal Corporativo</p>
                <form onsubmit="App.handleLogin(event)" class="space-y-4">
                    <input type="text" id="username-input" placeholder="Usuário" class="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-zinc-800 border-none font-bold text-sm text-slate-800 dark:text-white outline-none uppercase focus:ring-2 focus:ring-brand-orange">
                    <input type="password" id="password-input" placeholder="Senha" class="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-zinc-800 border-none font-bold text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-brand-orange">
                    <div class="flex justify-between px-2"><label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="remember-me" class="w-4 h-4 rounded text-brand-orange"><span class="text-[10px] font-bold uppercase text-gray-500">Lembrar-me</span></label><button type="button" onclick="App.handleVisitorLogin()" class="text-[10px] font-bold uppercase text-brand-orange">Modo Visitante</button></div>
                    <div id="error-message" class="hidden p-3 bg-red-50 text-red-500 text-xs font-bold text-center rounded-xl"></div>
                    <button type="submit" class="w-full py-4 bg-brand-orange text-white font-black rounded-2xl shadow-lg uppercase text-xs tracking-widest active:scale-95 transition-all">Entrar no Sistema</button>
                </form>
            </div>
        </div>
    `,
    getModals: () => `
        <div id="sidebar-overlay" onclick="document.getElementById('sidebar-menu').classList.add('-translate-x-full'); this.style.display='none'"></div>
        <div id="admin-login-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div class="bg-white dark:bg-zinc-900 w-full max-w-sm p-6 rounded-[2rem] text-center shadow-2xl">
                <h3 class="text-xl font-black text-brand-orange uppercase italic mb-6">Acesso Administrativo</h3>
                <div id="keypad-display" class="h-12 bg-gray-100 dark:bg-zinc-800 rounded-xl mb-4 flex items-center justify-center text-2xl tracking-widest font-black dark:text-white"></div>
                <div id="virtual-keypad" class="keypad-grid mb-4"></div>
                <button onclick="Modals.close('admin-login-modal')" class="text-xs font-bold text-gray-400 uppercase">Cancelar</button>
            </div>
        </div>
        <div id="share-modal" class="hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
            <div class="bg-white dark:bg-zinc-900 w-full sm:max-w-md p-6 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl">
                <div class="flex justify-between mb-6"><h3 class="font-black text-brand-green dark:text-white uppercase italic text-lg">Proposta</h3><button onclick="Modals.close('share-modal')" class="p-2 text-gray-500">✕</button></div>
                <div id="share-product-name" class="text-sm font-bold text-gray-500 uppercase mb-6 text-center border-b pb-4"></div>
                <div class="flex p-1 bg-gray-100 dark:bg-zinc-800 rounded-2xl mb-6">
                    <button id="btn-mode-vista" onclick="Modals.setShareMode('vista')" class="flex-1 py-3 rounded-xl text-[10px] font-black uppercase">À Vista</button>
                    <button id="btn-mode-parcelado" onclick="Modals.setShareMode('parcelado')" class="flex-1 py-3 rounded-xl text-[10px] font-black uppercase">Parcelado</button>
                </div>
                <div id="share-input-container" class="mb-6"></div>
                <button onclick="Modals.confirmShare()" class="w-full py-4 bg-green-500 text-white font-black rounded-2xl uppercase text-xs tracking-widest">Enviar WhatsApp</button>
            </div>
        </div>
        <div id="availability-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div class="bg-white dark:bg-zinc-900 w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl">
                <div class="flex justify-between mb-6"><h3 class="font-black text-brand-green dark:text-white uppercase italic text-lg">Estoque</h3><button onclick="Modals.close('availability-modal')" class="p-2 text-gray-500">✕</button></div>
                <p id="modal-product-name" class="text-xs font-bold text-gray-500 uppercase mb-6 text-center"></p>
                <div id="modal-sellers-list" class="space-y-3 mb-6"></div>
                <button onclick="ContactController.sendAvailability()" class="w-full py-4 bg-brand-orange text-white font-black rounded-2xl uppercase text-xs">Iniciar Conversa</button>
            </div>
        </div>
        <div id="used-details-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
            <div class="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                <div class="w-full md:w-1/2 h-64 md:h-auto bg-gray-100 dark:bg-zinc-800 relative"><div id="modal-used-main-img" class="absolute inset-0 bg-cover bg-center"></div></div>
                <div class="w-full md:w-1/2 p-8 flex flex-col overflow-y-auto">
                    <div class="flex justify-between mb-4"><h2 id="modal-used-title" class="text-2xl font-black dark:text-white uppercase italic italic w-3/4"></h2><button onclick="Modals.close('used-details-modal')" class="p-2 text-gray-500">✕</button></div>
                    <div id="modal-used-thumbnails" class="flex gap-2 overflow-x-auto mb-6"></div>
                    <p id="modal-used-desc" class="text-sm text-gray-600 dark:text-gray-300 mb-6"></p>
                    <div class="mt-auto pt-6 border-t dark:border-zinc-800">
                        <div class="flex justify-between items-end mb-4"><span class="text-xs font-bold text-gray-400">Investimento</span><span id="modal-used-price" class="text-3xl font-black text-brand-orange italic"></span></div>
                        <div class="flex gap-2"><button onclick="ContactController.sendUsed('reserve')" class="flex-1 py-4 bg-brand-orange text-white font-black rounded-2xl uppercase text-[10px]">Reservar</button><button onclick="ContactController.sendUsed('consult')" class="flex-1 py-4 border-2 border-brand-green text-brand-green font-black rounded-2xl uppercase text-[10px]">Consultar</button></div>
                    </div>
                </div>
            </div>
        </div>
        <div id="admin-form-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
             <div class="bg-white dark:bg-zinc-900 w-full max-w-md p-6 rounded-[2rem] shadow-2xl">
                <h3 id="admin-modal-title" class="font-black text-brand-orange uppercase italic mb-4"></h3>
                <div id="admin-dynamic-form" class="space-y-3 mb-6"></div>
                <div class="flex gap-2"><button onclick="Modals.close('admin-form-modal')" class="flex-1 py-3 bg-gray-100 dark:bg-zinc-800 font-bold rounded-xl text-xs">Cancelar</button><button onclick="AdminController.save()" class="flex-1 py-3 bg-green-600 text-white font-black rounded-xl text-xs">Salvar</button></div>
            </div>
        </div>
        <div id="delete-confirm-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
             <div class="bg-white dark:bg-zinc-900 w-full max-w-xs p-6 rounded-[2rem] text-center shadow-2xl">
                <div class="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">!</div>
                <h3 class="font-black dark:text-white uppercase mb-6">Confirmar exclusão?</h3>
                <div class="flex gap-2"><button onclick="Modals.close('delete-confirm-modal')" class="flex-1 py-3 bg-gray-100 dark:bg-zinc-800 font-bold rounded-xl text-xs">Voltar</button><button onclick="AdminController.confirmDelete()" class="flex-1 py-3 bg-red-500 text-white font-black rounded-xl text-xs">Excluir</button></div>
            </div>
        </div>
    `
};

const ViewRenderer = {
    dashboardLayout: () => `
        <div id="dashboard-view" class="flex h-screen overflow-hidden bg-gray-50 dark:bg-black">
            ${ViewRenderer._sidebar()}
            <div class="flex-1 flex flex-col min-w-0 overflow-y-auto font-sans relative">
                ${ViewRenderer._header()}
                <main id="main-content" class="p-4 sm:p-8 space-y-6 fade-in"></main>
            </div>
            ${ViewRenderer._calculatorFab()}
        </div>
    `,
    _sidebar: () => {
        const u = appStore.state.currentUser;
        return `
        <aside id="sidebar-menu" class="fixed inset-y-0 left-0 w-72 bg-white dark:bg-zinc-900 shadow-2xl transform -translate-x-full lg:relative lg:translate-x-0 transition-transform duration-300 z-40 flex flex-col border-r border-gray-100 dark:border-zinc-800">
            <div class="p-8 border-b dark:border-zinc-800 flex flex-col items-center">
                <div class="w-24 h-24 rounded-full bg-brand-orange text-white flex items-center justify-center font-bold text-3xl mb-4 overflow-hidden profile-avatar-div" style="background-image: url('${u.avatar || ''}')">${u.avatar ? '' : u.name[0]}</div>
                <p class="font-black text-sm dark:text-white uppercase italic">${u.name}</p>
                <p class="text-[10px] text-brand-green font-bold uppercase mt-1">${u.role}</p>
            </div>
            <nav class="flex-1 px-4 py-6 space-y-2">
                <button onclick="App.navigate('dashboard')" class="sidebar-link w-full px-6 py-4 rounded-2xl font-bold text-left uppercase text-sm italic">Dashboard</button>
                <button onclick="App.navigate('consultas')" class="sidebar-link w-full px-6 py-4 rounded-2xl font-bold text-left uppercase text-sm italic">Novos</button>
                <button onclick="App.navigate('usados')" class="sidebar-link w-full px-6 py-4 rounded-2xl font-bold text-left uppercase text-sm italic">Seminovos</button>
                <div class="pt-6 mt-2 border-t dark:border-zinc-800 space-y-2">
                    ${u.role === 'Administrador' ? `<button onclick="App.navigate('admin')" class="sidebar-link w-full px-6 py-4 rounded-2xl font-bold text-left text-red-500 uppercase text-sm italic">Gestão</button>` : ''}
                    <button onclick="App.navigate('perfil')" class="sidebar-link w-full px-6 py-4 rounded-2xl font-bold text-left text-slate-500 uppercase text-sm italic">Meu Perfil</button>
                </div>
            </nav>
        </aside>`;
    },
    _header: () => `
        <header class="h-20 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-b dark:border-zinc-800 px-8 flex items-center justify-between sticky top-0 z-30">
            <div class="flex items-center gap-3">
                <button onclick="document.getElementById('sidebar-menu').classList.remove('-translate-x-full'); document.getElementById('sidebar-overlay').style.display='block'" class="lg:hidden p-2 bg-gray-100 dark:bg-zinc-800 rounded-xl"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke-width="2"></path></svg></button>
                <h1 id="page-title" class="text-xl font-black dark:text-white uppercase italic tracking-tighter">Galvão Drones</h1>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="Utils.toggleTheme()" class="p-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800"><svg class="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg></button>
                <button onclick="Utils.reload()" class="px-5 py-2.5 bg-brand-orange text-white font-black rounded-xl text-[10px] uppercase">Sair</button>
            </div>
        </header>
    `,
    _calculatorFab: () => `
        <button onclick="Modals.toggleCalculator()" class="fixed bottom-6 right-6 w-16 h-16 bg-brand-orange text-white rounded-full shadow-2xl flex items-center justify-center z-50 transition-all active:scale-90"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" stroke-width="2"></path></svg></button>
        <div id="calculator-popup" class="hidden fixed bottom-24 right-6 w-80 sm:w-96 glass-card rounded-[2rem] shadow-2xl border dark:border-zinc-700 p-6 z-50">
            <div class="flex justify-between mb-6"><h3 class="font-black text-brand-green dark:text-white uppercase italic text-xl">Simulador</h3><button onclick="Modals.toggleCalculator()" class="text-gray-400 text-2xl">×</button></div>
            <div class="space-y-4">
                <input type="number" id="popup-sale-value" placeholder="Valor Base (R$)" class="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 rounded-xl font-bold dark:text-white outline-none">
                <div class="flex items-center gap-3 p-3 bg-brand-orange/5 rounded-xl border border-brand-orange/10"><input type="checkbox" id="popup-include-nf"><label class="text-[10px] font-black uppercase dark:text-zinc-300">Incluir NF (+6%)</label></div>
                <select id="popup-installments" class="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 rounded-xl font-bold text-sm dark:text-white outline-none"><option value="0">Parcelas...</option>${Object.keys(Config.installmentRates).map(i => `<option value="${i}">${i}x</option>`).join('')}</select>
                <div id="popup-calculator-results" class="hidden p-4 rounded-2xl bg-brand-green/5 border border-brand-green/10">
                    <div class="flex justify-between text-xs font-black uppercase"><span class="text-gray-400">Total:</span><span id="popup-total-value" class="dark:text-white"></span></div>
                    <div class="flex justify-between items-center text-brand-orange pt-2"><span class="text-xs font-black uppercase">Parcela:</span><span id="popup-installment-value" class="text-xl font-black dark:text-white"></span></div>
                </div>
                <button onclick="App.shareCalc()" class="w-full py-4 bg-green-500 text-white font-black rounded-2xl uppercase text-[10px]">WhatsApp</button>
            </div>
        </div>
    `,
    dashboard: () => {
        const u = appStore.state.currentUser;
        return `
        <div class="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border dark:border-zinc-800 mb-6">
            <h2 class="text-3xl font-black italic text-slate-800 dark:text-white uppercase">Olá, <span class="text-brand-orange">${u.name.split(' ')[0]}</span>!</h2>
            <p class="text-gray-500 mt-2 font-bold uppercase text-[10px]">${u.city || 'Central'} | ${u.role}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${ViewRenderer._cardBtn('consultas', 'bg-emerald-50 text-brand-green', 'Catálogo Novos', 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z')}
            ${ViewRenderer._cardBtn('usados', 'bg-blue-50 text-blue-600', 'Seminovos', 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15')}
        </div>`;
    },
    catalog: () => {
        const prods = appStore.state.products;
        const isVis = appStore.state.currentUser.role === 'Visitante';
        return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${prods.map(p => `
            <div class="bg-white dark:bg-zinc-900 p-6 rounded-[2.5rem] border dark:border-zinc-800 shadow-sm text-left">
                <h3 class="font-black text-brand-green dark:text-white uppercase italic text-xs">${p.name}</h3>
                <p class="text-[10px] text-gray-500 uppercase font-bold mt-1">${p.line}</p>
                ${!isVis ? `<div class="mt-4 pt-4 border-t dark:border-zinc-800"><p class="text-[8px] font-black text-gray-400 uppercase">Valor DJI</p><p class="text-2xl font-black text-brand-green dark:text-white italic">${Utils.fmtBRL.format(Utils.cleanCurrency(p.sell))}</p></div>` : ''}
                <div class="mt-4 flex flex-col gap-2">
                    <button onclick="Modals.openAvailability('${p.name}')" class="w-full bg-brand-green text-white py-4 rounded-2xl font-black uppercase text-[9px]">Contato</button>
                    ${!isVis ? `<button onclick="Modals.openShare('${p.name}', ${Utils.cleanCurrency(p.sell)})" class="w-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-white py-3 rounded-2xl font-bold uppercase text-[9px]">Compartilhar</button>` : ''}
                </div>
            </div>`).join('')}</div>`;
    },
    used: () => {
        const prods = appStore.state.usedProducts;
        return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${prods.map((p, idx) => `
            <div class="bg-white dark:bg-zinc-900 p-6 rounded-[2.5rem] border dark:border-zinc-800 shadow-sm cursor-pointer" onclick="Modals.openUsedDetails(${idx})">
                <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase badge-seminovo mb-2 inline-block">${p.condition}</span>
                <h3 class="font-black text-slate-800 dark:text-white uppercase italic text-lg mb-2">${p.name}</h3>
                <div class="w-full h-40 bg-gray-50 dark:bg-zinc-800 rounded-xl mb-4 bg-cover bg-center" style="background-image: url('${Array.isArray(p.images) ? p.images[0] : p.image}')"></div>
                <p class="text-2xl font-black text-brand-orange italic">${Utils.fmtBRL.format(Utils.cleanCurrency(p.price))}</p>
            </div>`).join('')}</div>`;
    },
    profile: () => {
        const u = appStore.state.currentUser;
        return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border dark:border-zinc-800 text-center flex flex-col items-center">
                <div class="relative w-32 h-32 rounded-full border-4 border-brand-orange shadow-2xl overflow-hidden profile-avatar-div" style="background-image: url('${u.avatar || ''}')"></div>
                <div class="mt-8 mb-4 w-40 h-40 border-4 border-brand-green/30 p-2 bg-white rounded-3xl overflow-hidden"><img id="profile-qrcode" class="w-full h-full opacity-0"></div>
                <div class="flex items-center gap-2"><label class="switch"><input type="checkbox" id="qr-central-check" onchange="ProfileController.genQRCode()"><span class="slider"></span></label><span class="text-[9px] font-black text-gray-400 uppercase">Contato Central</span></div>
                <h3 class="text-2xl font-black dark:text-white uppercase italic mt-6">${u.name}</h3>
                <p class="text-brand-orange font-bold uppercase text-[10px]">${u.role}</p>
            </div>
            <div class="lg:col-span-2 bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border dark:border-zinc-800 space-y-6">
                <div><label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">WhatsApp</label><input value="${u.phone || ''}" class="w-full p-4 bg-gray-50 dark:bg-zinc-800 rounded-2xl font-bold dark:text-white" readonly></div>
                <div><label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Cidade</label><input value="${u.city || 'Goiânia - GO'}" class="w-full p-4 bg-gray-50 dark:bg-zinc-800 rounded-2xl font-bold dark:text-white" readonly></div>
                <div><label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Endereço</label><input value="${u.address || ''}" class="w-full p-4 bg-gray-50 dark:bg-zinc-800 rounded-2xl font-bold dark:text-white" readonly></div>
            </div>
        </div>`;
    },
    admin: () => {
        const make = (t, items, type, row) => `
            <div class="bg-white dark:bg-zinc-900 rounded-[2rem] border dark:border-zinc-800 overflow-hidden flex flex-col h-[500px]">
                <div class="p-5 border-b dark:border-zinc-800 flex justify-between items-center"><h3 class="font-black uppercase text-[10px] text-brand-green italic">${t}</h3><button onclick="AdminController.openForm('${type}')" class="p-2 bg-brand-green text-white rounded-lg">+</button></div>
                <div class="flex-1 overflow-y-auto p-4 space-y-2">${items.map((it, i) => `<div class="flex justify-between items-center p-3 border-b dark:border-zinc-800">${row(it)}<div class="flex gap-2"><button onclick="AdminController.openForm('${type}', ${i})" class="text-blue-500">✎</button><button onclick="AdminController.delete('${type}', ${i})" class="text-red-500">🗑</button></div></div>`).join('')}</div>
            </div>`;
        return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            ${make("Equipe", appStore.state.users, 'user', u => `<div><p class="text-xs font-bold dark:text-white">${u.name}</p><p class="text-[9px] text-gray-500 uppercase">${u.role}</p></div>`)}
            ${make("Novos", appStore.state.products, 'product', p => `<div><p class="text-xs font-bold dark:text-white">${p.name}</p><p class="text-[9px] text-brand-green font-bold">${p.sell}</p></div>`)}
            ${make("Usados", appStore.state.usedProducts, 'used', u => `<div><p class="text-xs font-bold dark:text-white">${u.name}</p><p class="text-[9px] text-brand-orange">${u.condition}</p></div>`)}
        </div>`;
    },
    _cardBtn: (p, c, t, i) => `<button onclick="App.navigate('${p}')" class="p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border dark:border-zinc-800 flex flex-col items-center w-full"><div class="p-5 rounded-3xl mb-4 ${c}"><svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="${i}" stroke-width="2" stroke-linecap="round"></path></svg></div><span class="font-black uppercase text-xs dark:text-white tracking-widest italic">${t}</span></button>`,
    filterGrid: (inp, sel) => {
        const val = inp.value.toLowerCase();
        document.querySelectorAll(sel).forEach(c => c.style.display = c.innerText.toLowerCase().includes(val) ? 'block' : 'none');
    }
};

/**
 * ==========================================
 * 6. CONTROLADORES
 * ==========================================
 */
const Modals = {
    open: (id) => document.getElementById(id).classList.remove('hidden'),
    close: (id) => document.getElementById(id).classList.add('hidden'),
    toggleCalculator: () => document.getElementById('calculator-popup').classList.toggle('hidden'),
    openDrive: (k) => {
        const u = Config.driveLinks[k];
        if (!u) return alert("Erro");
        const m = document.getElementById('drive-webview-modal');
        document.getElementById('drive-iframe').src = u;
        m.classList.remove('hidden');
    },
    openMarketing: (idx) => {
        const m = appStore.state.marketingAssets[idx];
        document.getElementById('mkt-modal-title').textContent = m.title;
        document.getElementById('mkt-variations-list').innerHTML = m.variations.map(v => `
            <label class="flex items-center p-3 rounded-xl bg-gray-50 dark:bg-zinc-800 cursor-pointer mb-2 border-2 border-transparent">
                <input type="radio" name="mkt-file" value="${v.url}" class="mr-3">
                <span class="text-xs font-bold dark:text-white uppercase">${v.name}</span>
            </label>
        `).join('');
        Modals.open('marketing-modal');
    },
    openShare: (n, p) => {
        appStore.state.currentShareProduct = { name: n, price: p };
        document.getElementById('share-product-name').textContent = n;
        Modals.setShareMode('vista');
        Modals.open('share-modal');
    },
    setShareMode: (m) => {
        appStore.state.shareMode = m;
        const cont = document.getElementById('share-input-container');
        if (m === 'vista') {
            cont.innerHTML = `<label class="text-[10px] font-bold uppercase text-gray-400 block mb-2">Desconto (%)</label><input type="number" id="share-discount" placeholder="0" class="w-full p-4 rounded-xl bg-gray-50 dark:bg-zinc-800 font-bold dark:text-white">`;
        } else {
            const opts = Object.keys(Config.installmentRates).map(i => `<option value="${i}">${i}x</option>`).join('');
            cont.innerHTML = `<label class="text-[10px] font-bold uppercase text-gray-400 block mb-2">Parcelas</label><select id="share-installments" class="w-full p-4 rounded-xl bg-gray-50 dark:bg-zinc-800 font-bold dark:text-white">${opts}</select>`;
        }
    },
    confirmShare: () => {
        const { name, price } = appStore.state.currentShareProduct;
        const m = appStore.state.shareMode;
        let details = "";
        if (m === 'vista') {
            let d = parseFloat(document.getElementById('share-discount').value || 0);
            if (d > 0) details = `\n🔥 À Vista: ${d}% OFF - Total: ${Utils.fmtBRL.format(price * (1 - d / 100))}`;
        } else {
            const n = parseInt(document.getElementById('share-installments').value);
            const rate = Config.installmentRates[n] || 0;
            const total = price * (1 + rate / 100);
            details = `\n💳 Parcelado: ${n}x de ${Utils.fmtBRL.format(total / n)}`;
        }
        const msg = `🚀 *PROPOSTA GALVÃO DRONES*\n*Produto:* ${name}\n*Valor Base:* ${Utils.fmtBRL.format(price)}${details}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        Modals.close('share-modal');
    },
    openUsedDetails: (idx) => {
        appStore.state.currentUsedIdx = idx;
        const p = appStore.state.usedProducts[idx];
        document.getElementById('modal-used-title').textContent = p.name;
        document.getElementById('modal-used-desc').textContent = p.desc;
        document.getElementById('modal-used-price').textContent = Utils.fmtBRL.format(Utils.cleanCurrency(p.price));
        document.getElementById('modal-used-main-img').style.backgroundImage = `url('${Array.isArray(p.images) ? p.images[0] : p.image}')`;
        Modals.open('used-details-modal');
    },
    openAvailability: (name) => {
        appStore.state.currentProduct = name;
        document.getElementById('modal-product-name').textContent = name;
        document.getElementById('modal-sellers-list').innerHTML = Object.keys(Config.contacts).map(k => `
            <label class="block p-4 border-2 border-gray-100 dark:border-zinc-800 rounded-2xl cursor-pointer">
                <input type="checkbox" name="vend_chk" value="${k}" class="mr-3">
                <span class="font-black uppercase dark:text-white">${k}</span>
            </label>
        `).join('');
        Modals.open('availability-modal');
    }
};

const AdminController = {
    buffer: "",
    initLogin: () => {
        AdminController.buffer = "";
        document.getElementById('keypad-display').textContent = "";
        const vk = document.getElementById('virtual-keypad'); vk.innerHTML = '';
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5).forEach(n => {
            const b = document.createElement('button'); b.className = 'key-btn'; b.textContent = n; b.onclick = () => AdminController.key(n); vk.appendChild(b);
        });
    },
    key: (n) => {
        AdminController.buffer += n;
        document.getElementById('keypad-display').textContent = "*".repeat(AdminController.buffer.length);
        if (AdminController.buffer === Config.adminPassCode) {
            appStore.setAdminSession(true); Modals.close('admin-login-modal'); App.navigate('admin');
        } else if (AdminController.buffer.length >= 4) {
            setTimeout(() => { AdminController.buffer = ""; document.getElementById('keypad-display').textContent = ""; }, 500);
        }
    },
    openForm: (type, idx = null) => {
        appStore.state.adminEdit = { type, index: idx };
        document.getElementById('admin-modal-title').textContent = (idx !== null ? 'Editar ' : 'Novo ') + type;
        const d = idx !== null ? appStore.state[type === 'user' ? 'users' : type === 'product' ? 'products' : 'usedProducts'][idx] : {};
        let h = "";
        if (type === 'user') {
            h = `<input id="af-name" value="${d.name || ''}" placeholder="Nome" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><input id="af-username" value="${d.username || ''}" placeholder="Usuário" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><input id="af-password" value="${d.password || ''}" placeholder="Senha" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><select id="af-role" class="w-full p-4 border rounded-xl dark:bg-zinc-800 dark:text-white"><option value="Vendedor" ${d.role === 'Vendedor' ? 'selected' : ''}>Vendedor</option><option value="Vendas externa" ${d.role === 'Vendas externa' ? 'selected' : ''}>Vendas externa</option><option value="Administrador" ${d.role === 'Administrador' ? 'selected' : ''}>Administrador</option></select>`;
        } else if (type === 'product') {
            h = `<input id="af-name" value="${d.name || ''}" placeholder="Nome Produto" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><input id="af-sell" value="${d.sell || ''}" placeholder="Preço (ex: 2.500,00)" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white">`;
        }
        document.getElementById('admin-dynamic-form').innerHTML = h;
        Modals.open('admin-form-modal');
    },
    save: async () => {
        const { type, index } = appStore.state.adminEdit;
        let item = {};
        if (type === 'user') {
            item = { name: document.getElementById('af-name').value, username: document.getElementById('af-username').value, password: document.getElementById('af-password').value, role: document.getElementById('af-role').value, phone: "", city: "Goiânia - GO", address: "", avatar: "" };
        } else if (type === 'product') {
            item = { name: document.getElementById('af-name').value, sell: document.getElementById('af-sell').value, line: "DJI", icon: "🛸", type: "Equipamentos" };
        }
        if (index !== null) await appStore.updateItem(type, index, item);
        else await appStore.addItem(type, item);
        Modals.close('admin-form-modal');
        App.navigate('admin');
    },
    delete: (type, idx) => { appStore.state.deleteTarget = { type, index: idx }; Modals.open('delete-confirm-modal'); },
    confirmDelete: async () => { await appStore.deleteItem(appStore.state.deleteTarget.type, appStore.state.deleteTarget.index); Modals.close('delete-confirm-modal'); App.navigate('admin'); }
};

const ContactController = {
    sendUsed: (opt) => {
        const p = appStore.state.usedProducts[appStore.state.currentUsedIdx];
        const msg = opt === 'reserve' ? `🛑 RESERVA: ${p.name}` : `🔍 CONSULTA: ${p.name}`;
        window.open(`https://wa.me/55${Config.centralNumber}?text=${encodeURIComponent(msg)}`, '_blank');
    },
    sendAvailability: () => {
        const sel = Array.from(document.querySelectorAll('input[name="vend_chk"]:checked')).map(c => c.value);
        if (!sel.length) return alert("Selecione");
        const msg = `🔍 CONSULTA: ${appStore.state.currentProduct}`;
        sel.forEach(s => window.open(`https://wa.me/55${Config.contacts[s]}?text=${encodeURIComponent(msg)}`, '_blank'));
    }
};

const App = {
    init: async () => { await appStore.loadData(); App.renderLogin(); Bypass.init(); },
    renderLogin: () => { document.getElementById('app-root').innerHTML = Templates.login(); document.getElementById('modals-container').innerHTML = Templates.getModals(); },
    renderApp: () => { document.getElementById('app-root').innerHTML = ViewRenderer.dashboardLayout(); document.getElementById('modals-container').innerHTML = Templates.getModals(); App.navigate('dashboard'); App.setupCalculator(); },
    handleLogin: async (e) => {
        e.preventDefault();
        const res = await AuthService.login(document.getElementById('username-input').value, document.getElementById('password-input').value);
        if (res.success) App.renderApp();
        else { const err = document.getElementById('error-message'); err.textContent = res.msg; err.classList.remove('hidden'); }
    },
    handleVisitorLogin: async () => { await AuthService.login("consultas", ""); appStore.setUser({ name: "Visitante", role: "Visitante", avatar: "" }); App.renderApp(); },
    navigate: (p) => {
        if (p === 'admin' && !appStore.state.adminSession) { Modals.open('admin-login-modal'); AdminController.initLogin(); return; }
        document.getElementById('page-title').textContent = p.toUpperCase();
        const c = document.getElementById('main-content');
        if (p === 'dashboard') c.innerHTML = ViewRenderer.dashboard();
        if (p === 'consultas') c.innerHTML = ViewRenderer.catalog();
        if (p === 'usados') c.innerHTML = ViewRenderer.used();
        if (p === 'marketing') c.innerHTML = ViewRenderer.marketing();
        if (p === 'perfil') c.innerHTML = ViewRenderer.profile();
        if (p === 'admin') c.innerHTML = ViewRenderer.admin();
        if (p === 'sobre') c.innerHTML = ViewRenderer.about();
        document.getElementById('sidebar-menu').classList.add('-translate-x-full');
        document.getElementById('sidebar-overlay').style.display = 'none';
    },
    setupCalculator: () => {
        const inp = document.getElementById('popup-sale-value'); const sel = document.getElementById('popup-installments');
        if (!inp) return;
        const calc = () => {
            const v = parseFloat(inp.value) || 0; const i = parseInt(sel.value) || 0; const nf = document.getElementById('popup-include-nf').checked ? 1.06 : 1;
            if (v > 0 && i > 0) {
                const tot = (v * nf) * (1 + (Config.installmentRates[i] || 0) / 100);
                document.getElementById('popup-total-value').textContent = Utils.fmtBRL.format(tot);
                document.getElementById('popup-installment-value').textContent = `${i}x de ${Utils.fmtBRL.format(tot / i)}`;
                document.getElementById('popup-calculator-results').classList.remove('hidden');
            }
        };
        inp.oninput = calc; sel.onchange = calc; document.getElementById('popup-include-nf').onchange = calc;
    },
    shareCalc: () => { window.open(`https://wa.me/?text=${encodeURIComponent("*Simulação:* " + document.getElementById('popup-total-value').textContent)}`, '_blank'); }
};

const ProfileController = {
    genQRCode: () => {
        const u = appStore.state.currentUser;
        const phone = document.getElementById('qr-central-check').checked ? Config.centralNumber : (u.phone || Config.centralNumber);
        const img = document.getElementById('profile-qrcode');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent('https://wa.me/55' + phone)}`;
        img.classList.remove('opacity-0');
    }
};

const Bypass = {
    clicks: 0,
    init: () => { document.getElementById('login-logo-trigger').onclick = () => { Bypass.clicks++; if (Bypass.clicks >= 5) { localStorage.clear(); location.reload(); } }; }
};

document.addEventListener('DOMContentLoaded', App.init);
