/**
 * ==========================================
 * 1. CONFIGURAÇÃO & DADOS DE FALLBACK
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
        { name: "Mikhaell Galvão", username: "mikhaell", password: "mk0639", role: "Administrador", phone: "62984710639", avatar: "https://i.imgur.com/ViDcChZ.jpeg" },
        { name: "Maikhon Galvão", username: "maikhon", password: "0639", role: "Administrador", phone: "62933001865", avatar: "https://i.imgur.com/49xvSy4.jpeg" },
        { name: "Visitante", username: "consultas", password: "", role: "Visitante", phone: "6236360668", avatar: "" }
    ],
    products: [{ id: 1000, name: "Drone DJI Neo 2", cost: "1.660,00", sell: "2.324,00", line: "Consumer" }],
    used: [{ name: "Mavic 3 Pro", price: "14.000,00", condition: "Seminovo", images: ["https://imgur.com/2PNy5CS.png"] }],
    marketing: [{ title: "Logo Vetor (SVG)", type: "Logo", downloadUrl: "assets/logo.svg" }]
};

const Utils = {
    fmtBRL: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    cleanCurrency: (val) => parseFloat((val || "0").toString().replace(/\./g, '').replace(',', '.')),
    toggleTheme: () => document.documentElement.classList.toggle('dark'),
    reload: () => { 
        localStorage.clear(); 
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
            currentUser: null, users: [], products: [], usedProducts: [], marketingAssets: [],
            adminSession: false, isLocked: false, loginAttempts: 0, currentProduct: "",
            currentShareProduct: { name: "", price: 0 }, shareMode: 'vista',
            adminEdit: { type: null, index: null }, currentUsedIdx: null, deleteTarget: null
        };
    }

    setUser(user) { this.state.currentUser = user; }
    setAdminSession(isActive) { this.state.adminSession = isActive; }

    async loadData() {
        try {
            console.log("🛰️ Sincronização Cloud Ativa...");
            const usersRef = window.Firestore.collection(window.db, 'users');
            const productsRef = window.Firestore.collection(window.db, 'products');
            const usedRef = window.Firestore.collection(window.db, 'used');

            window.Firestore.onSnapshot(productsRef, (snap) => {
                this.state.products = snap.docs.map(d => ({ ...d.data(), fireId: d.id }));
                this._refreshIfActive(['CONSULTAS', 'ADMIN']);
            });

            window.Firestore.onSnapshot(usersRef, (snap) => {
                this.state.users = snap.docs.map(d => ({ ...d.data(), fireId: d.id }));
                if (snap.empty) this._migrateToCloud(usersRef, FallbackData.users);
                this._refreshIfActive(['ADMIN']);
            });

            window.Firestore.onSnapshot(usedRef, (snap) => {
                this.state.usedProducts = snap.docs.map(d => ({ ...d.data(), fireId: d.id }));
                this._refreshIfActive(['USADOS', 'ADMIN']);
            });

            this.state.marketingAssets = FallbackData.marketing;
        } catch (e) {
            console.error("❌ Erro Cloud.", e);
            this.state.users = FallbackData.users;
            this.state.products = FallbackData.products;
            this.state.usedProducts = FallbackData.used;
        }
    }

    _refreshIfActive(pages) {
        const title = document.getElementById('page-title')?.textContent;
        if (title && pages.includes(title)) App.navigate(title.toLowerCase());
    }

    async addItem(type, item) {
        const col = type === 'user' ? 'users' : type === 'product' ? 'products' : 'used';
        await window.Firestore.addDoc(window.Firestore.collection(window.db, col), item);
    }

    async updateItem(type, index, item) {
        const col = type === 'user' ? 'users' : type === 'product' ? 'products' : 'used';
        const key = type === 'user' ? 'users' : type === 'product' ? 'products' : 'usedProducts';
        const id = this.state[key][index].fireId;
        if (id) await window.Firestore.updateDoc(window.Firestore.doc(window.db, col, id), item);
    }

    async deleteItem(type, index) {
        const col = type === 'user' ? 'users' : type === 'product' ? 'products' : 'used';
        const key = type === 'user' ? 'users' : type === 'product' ? 'products' : 'usedProducts';
        const id = this.state[key][index].fireId;
        if (id) await window.Firestore.deleteDoc(window.Firestore.doc(window.db, col, id));
    }

    async _migrateToCloud(ref, data) {
        const batch = window.Firestore.writeBatch(window.db);
        data.forEach(item => batch.set(window.Firestore.doc(ref), item));
        await batch.commit();
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
        if (appStore.state.isLocked) return { success: false, msg: "Temporariamente Bloqueado." };
        
        // Garante acesso mesmo se o Firebase estiver carregando
        const list = appStore.state.users.length > 0 ? appStore.state.users : FallbackData.users;
        const user = list.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        
        if (user) {
            appStore.setUser(user);
            return { success: true };
        } else {
            appStore.state.loginAttempts++;
            if (appStore.state.loginAttempts >= 3) {
                appStore.state.isLocked = true;
                setTimeout(() => appStore.state.isLocked = false, 30000);
            }
            return { success: false, msg: "Usuário ou Senha inválidos." };
        }
    }
}

/**
 * ==========================================
 * 4. TEMPLATES & RENDERER
 * ==========================================
 */
const Templates = {
    login: () => `
        <div class="min-h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-black">
            <div class="bg-white dark:bg-zinc-900 w-full max-w-md p-8 rounded-[2.5rem] shadow-2xl border dark:border-zinc-800">
                <div class="flex justify-center mb-8"><div id="login-logo-trigger" class="w-24 h-24 bg-gray-50 dark:bg-zinc-800 rounded-full flex items-center justify-center cursor-pointer"><img src="https://imgur.com/ny5U9KV.png" class="w-16 h-16"></div></div>
                <h2 class="text-center text-2xl font-black text-brand-green dark:text-white uppercase italic mb-8">Galvão Drones</h2>
                <form onsubmit="App.handleLogin(event)" class="space-y-4">
                    <input type="text" id="username-input" placeholder="Usuário" class="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-zinc-800 border-none font-bold outline-none uppercase">
                    <input type="password" id="password-input" placeholder="Senha" class="w-full px-6 py-4 rounded-2xl bg-gray-50 dark:bg-zinc-800 border-none font-bold outline-none">
                    <div id="error-message" class="hidden p-3 bg-red-50 text-red-500 text-xs font-bold text-center rounded-xl"></div>
                    <button type="submit" class="w-full py-4 bg-brand-orange text-white font-black rounded-2xl shadow-lg uppercase text-xs">Entrar no Sistema</button>
                    <button type="button" onclick="App.handleVisitorLogin()" class="w-full mt-2 text-[10px] font-bold text-gray-400 uppercase">Acesso Consultas</button>
                </form>
            </div>
        </div>`,
    getModals: () => `
        <div id="sidebar-overlay" onclick="document.getElementById('sidebar-menu').classList.add('-translate-x-full'); this.style.display='none'"></div>
        <div id="admin-login-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div class="bg-white dark:bg-zinc-900 w-full max-w-sm p-6 rounded-[2rem] text-center shadow-2xl">
                <h3 class="text-xl font-black text-brand-orange uppercase italic mb-6">Teclado Admin</h3>
                <div id="keypad-display" class="h-12 bg-gray-100 dark:bg-zinc-800 rounded-xl mb-4 flex items-center justify-center text-2xl font-black dark:text-white"></div>
                <div id="virtual-keypad" class="keypad-grid mb-4"></div>
                <button onclick="Modals.close('admin-login-modal')" class="text-xs font-bold text-gray-400 uppercase">Sair</button>
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
                <h3 class="font-black dark:text-white uppercase mb-6">Confirmar exclusão?</h3>
                <div class="flex gap-2"><button onclick="Modals.close('delete-confirm-modal')" class="flex-1 py-3 bg-gray-100 dark:bg-zinc-800 font-bold rounded-xl text-xs">Voltar</button><button onclick="AdminController.confirmDelete()" class="flex-1 py-3 bg-red-500 text-white font-black rounded-xl text-xs">Excluir</button></div>
            </div>
        </div>`
};

const ViewRenderer = {
    dashboardLayout: () => `
        <div id="dashboard-view" class="flex h-screen overflow-hidden bg-gray-50 dark:bg-black">
            ${ViewRenderer._sidebar()}
            <div class="flex-1 flex flex-col min-w-0 overflow-y-auto font-sans relative">
                ${ViewRenderer._header()}
                <main id="main-content" class="p-4 sm:p-8 space-y-6 fade-in"></main>
            </div>
        </div>`,
    _sidebar: () => {
        const u = appStore.state.currentUser;
        return `
        <aside id="sidebar-menu" class="fixed inset-y-0 left-0 w-72 bg-white dark:bg-zinc-900 shadow-2xl transform -translate-x-full lg:relative lg:translate-x-0 transition-transform duration-300 z-40 flex flex-col border-r dark:border-zinc-800">
            <div class="p-8 border-b dark:border-zinc-800 flex flex-col items-center">
                <div class="w-24 h-24 rounded-full bg-brand-orange text-white flex items-center justify-center font-bold text-3xl mb-4 profile-avatar-div" style="background-image: url('${u.avatar || ''}')">${u.avatar ? '' : u.name[0]}</div>
                <p class="font-black text-sm dark:text-white uppercase italic">${u.name}</p>
                <p class="text-[10px] text-brand-green font-bold uppercase mt-1">${u.role}</p>
            </div>
            <nav class="flex-1 px-4 py-6 space-y-2">
                <button onclick="App.navigate('dashboard')" class="w-full px-6 py-4 rounded-2xl font-bold text-left uppercase text-sm italic">Dashboard</button>
                <button onclick="App.navigate('consultas')" class="w-full px-6 py-4 rounded-2xl font-bold text-left uppercase text-sm italic">Novos</button>
                <button onclick="App.navigate('usados')" class="w-full px-6 py-4 rounded-2xl font-bold text-left uppercase text-sm italic">Seminovos</button>
                <button onclick="App.navigate('admin')" class="w-full px-6 py-4 rounded-2xl font-bold text-left text-red-500 uppercase text-sm italic">Gestão</button>
            </nav>
        </aside>`;
    },
    _header: () => `<header class="h-20 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-b dark:border-zinc-800 px-8 flex items-center justify-between sticky top-0 z-30"><h1 id="page-title" class="text-xl font-black dark:text-white uppercase italic tracking-tighter">Galvão Drones</h1><div class="flex gap-3"><button onclick="Utils.toggleTheme()" class="p-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800">🌓</button><button onclick="Utils.reload()" class="px-5 py-2.5 bg-brand-orange text-white font-black rounded-xl text-[10px] uppercase">Sair</button></div></header>`,
    dashboard: () => `<div class="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border dark:border-zinc-800 mb-6"><h2 class="text-3xl font-black italic text-slate-800 dark:text-white uppercase">Bem-vindo, <span class="text-brand-orange">${appStore.state.currentUser.name.split(' ')[0]}</span>!</h2></div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"><button onclick="App.navigate('consultas')" class="p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border dark:border-zinc-800 flex flex-col items-center"><span class="font-black uppercase text-xs dark:text-white italic">Ver Novos</span></button></div>`,
    admin: () => {
        const make = (t, items, type, row) => `<div class="bg-white dark:bg-zinc-900 rounded-[2rem] border dark:border-zinc-800 overflow-hidden flex flex-col h-[400px]"><div class="p-5 border-b dark:border-zinc-800 flex justify-between items-center"><h3 class="font-black uppercase text-[10px] text-brand-green italic">${t}</h3><button onclick="AdminController.openForm('${type}')" class="p-2 bg-brand-green text-white rounded-lg">+</button></div><div class="flex-1 overflow-y-auto p-4 space-y-2">${items.map((it, i) => `<div class="flex justify-between items-center p-3 border-b dark:border-zinc-800">${row(it)}<div class="flex gap-2"><button onclick="AdminController.openForm('${type}', ${i})" class="text-blue-500">✎</button><button onclick="AdminController.delete('${type}', ${i})" class="text-red-500">🗑</button></div></div>`).join('')}</div></div>`;
        return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${make("Equipe", appStore.state.users, 'user', u => `<div><p class="text-xs font-bold dark:text-white">${u.name}</p></div>`)}${make("Novos", appStore.state.products, 'product', p => `<div><p class="text-xs font-bold dark:text-white">${p.name}</p></div>`)}${make("Usados", appStore.state.usedProducts, 'used', u => `<div><p class="text-xs font-bold dark:text-white">${u.name}</p></div>`)}</div>`;
    }
};

/**
 * ==========================================
 * 5. CONTROLADORES
 * ==========================================
 */
const AdminController = {
    buffer: "",
    initLogin: () => {
        AdminController.buffer = "";
        document.getElementById('keypad-display').textContent = "";
        const vk = document.getElementById('virtual-keypad'); vk.innerHTML = '';
        [0,1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5).forEach(n => {
            const b = document.createElement('button'); b.className = 'key-btn'; b.textContent = n; b.onclick = () => AdminController.key(n); vk.appendChild(b);
        });
    },
    key: (n) => {
        AdminController.buffer += n;
        document.getElementById('keypad-display').textContent = "*".repeat(AdminController.buffer.length);
        if (AdminController.buffer === Config.adminPassCode) { appStore.setAdminSession(true); Modals.close('admin-login-modal'); App.navigate('admin'); }
        else if (AdminController.buffer.length >= 4) { setTimeout(() => { AdminController.buffer = ""; document.getElementById('keypad-display').textContent = ""; }, 500); }
    },
    openForm: (type, idx = null) => {
        appStore.state.adminEdit = { type, index: idx };
        const d = idx !== null ? appStore.state[type === 'user' ? 'users' : type === 'product' ? 'products' : 'usedProducts'][idx] : {};
        let h = type === 'user' ? `<input id="af-name" value="${d.name || ''}" placeholder="Nome" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><input id="af-username" value="${d.username || ''}" placeholder="Usuário" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><input id="af-password" value="${d.password || ''}" placeholder="Senha" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><select id="af-role" class="w-full p-4 border rounded-xl dark:bg-zinc-800 dark:text-white"><option value="Vendedor">Vendedor</option><option value="Administrador">Administrador</option></select>` : `<input id="af-name" value="${d.name || ''}" placeholder="Nome" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white"><input id="af-sell" value="${d.sell || ''}" placeholder="Preço" class="w-full p-4 border rounded-xl bg-gray-50 dark:bg-zinc-800 dark:text-white">`;
        document.getElementById('admin-dynamic-form').innerHTML = h;
        document.getElementById('admin-modal-title').textContent = (idx !== null ? 'Editar ' : 'Novo ') + type;
        Modals.open('admin-form-modal');
    },
    save: async () => {
        const { type, index } = appStore.state.adminEdit;
        let item = type === 'user' ? { name: document.getElementById('af-name').value, username: document.getElementById('af-username').value, password: document.getElementById('af-password').value, role: document.getElementById('af-role').value, avatar: "" } : { name: document.getElementById('af-name').value, sell: document.getElementById('af-sell').value, cost: "0,00", line: "DJI" };
        if (index !== null) await appStore.updateItem(type, index, item); else await appStore.addItem(type, item);
        Modals.close('admin-form-modal');
    },
    delete: (type, idx) => { appStore.state.deleteTarget = { type, index: idx }; Modals.open('delete-confirm-modal'); },
    confirmDelete: async () => { await appStore.deleteItem(appStore.state.deleteTarget.type, appStore.state.deleteTarget.index); Modals.close('delete-confirm-modal'); }
};

const Modals = {
    open: (id) => document.getElementById(id).classList.remove('hidden'),
    close: (id) => document.getElementById(id).classList.add('hidden')
};

const App = {
    init: async () => { 
        if(!window.Firestore) return setTimeout(App.init, 100);
        await appStore.loadData(); 
        App.renderLogin(); 
        Bypass.init();
    },
    renderLogin: () => { document.getElementById('app-root').innerHTML = Templates.login(); document.getElementById('modals-container').innerHTML = Templates.getModals(); },
    renderApp: () => { document.getElementById('app-root').innerHTML = ViewRenderer.dashboardLayout(); document.getElementById('modals-container').innerHTML = Templates.getModals(); App.navigate('dashboard'); },
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
        if (p === 'admin') c.innerHTML = ViewRenderer.admin();
        document.getElementById('sidebar-menu').classList.add('-translate-x-full');
        document.getElementById('sidebar-overlay').style.display = 'none';
    }
};

const Bypass = {
    init: () => { 
        const logo = document.getElementById('login-logo-trigger');
        let clicks = 0;
        if(logo) logo.onclick = () => { clicks++; if (clicks >= 5) Utils.reload(); }; 
    }
};

document.addEventListener('DOMContentLoaded', App.init);
