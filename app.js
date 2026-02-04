/**
 * ==========================================
 * 1. CONFIGURAÇÃO (CONSTANTS)
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
    adminPassCode: "0639" // Código Bypass
};

const Utils = {
    fmtBRL: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    cleanCurrency: (val) => parseFloat((val || "0").toString().replace(/\./g, '').replace(',', '.')),
    toggleTheme: () => document.documentElement.classList.toggle('dark'),
    reload: () => location.reload(),
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
            passwords: { admin: "", download: "" },
            adminSession: false,
            isLocked: false,
            loginAttempts: 0,
            lockoutTimer: null,
            // Estado temporário de UI
            currentProduct: "",
            currentShareProduct: { name: "", price: 0 },
            shareMode: 'vista',
            adminEdit: { type: null, index: null },
            contactOption: 'availability',
            newContactOption: 'availability',
            currentUsedIdx: null,
            deleteTarget: null,
            intervals: []
        };
    }

    setUser(user) { this.state.currentUser = user; }
    setAdminSession(isActive) { this.state.adminSession = isActive; }
    
    async loadData() {
        try {
            // Tenta carregar arquivos JSON locais. Se falhar, usa arrays vazios ou mock.
            const [u, p, us, m, pass] = await Promise.all([
                this._fetchJson('usuarios.json'),
                this._fetchJson('produtos.json'),
                this._fetchJson('usados.json'),
                this._fetchJson('marketing.json'),
                this._fetchJson('pas.json')
            ]);
            
            this.state.users = u?.users || [];
            this.state.products = p?.products || [];
            this.state.usedProducts = us?.usedProducts || [];
            this.state.marketingAssets = this._normalizeMarketing(m?.marketingAssets);
            this.state.passwords = pass || { admin: "1234" };
        } catch (e) { 
            console.warn("Modo Offline ou Erro de JSON", e); 
        }
    }

    async _fetchJson(url) {
        try {
            const res = await fetch(url);
            return res.ok ? res.json() : null;
        } catch { return null; }
    }

    _normalizeMarketing(assets) {
        if (!assets) return [];
        return assets.map(a => (!a.variations && a.downloadUrl) 
            ? { ...a, variations: [{name: 'Padrão', url: a.downloadUrl}] } 
            : a
        );
    }

    // Operações CRUD (Memória)
    addItem(type, item) {
        if(type === 'user') this.state.users.push(item);
        if(type === 'product') this.state.products.push(item);
        if(type === 'used') this.state.usedProducts.push(item);
        if(type === 'marketing') this.state.marketingAssets.push(item);
    }

    updateItem(type, index, item) {
        if(type === 'user') this.state.users[index] = item;
        if(type === 'product') this.state.products[index] = item;
        if(type === 'used') this.state.usedProducts[index] = item;
        if(type === 'marketing') this.state.marketingAssets[index] = item;
    }

    deleteItem(type, index) {
        if(type === 'user') this.state.users.splice(index, 1);
        if(type === 'product') this.state.products.splice(index, 1);
        if(type === 'used') this.state.usedProducts.splice(index, 1);
        if(type === 'marketing') this.state.marketingAssets.splice(index, 1);
    }
}

const appStore = new Store();

/**
 * ==========================================
 * 3. SERVIÇOS (Auth & Lógica de Negócio)
 * ==========================================
 */
class AuthService {
    static async login(username, password) {
        if (appStore.state.isLocked) return { success: false, msg: "Bloqueado temporariamente." };
        
        const user = appStore.state.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            appStore.setUser(user);
            appStore.state.loginAttempts = 0;
            return { success: true };
        } else {
            appStore.state.loginAttempts++;
            if (appStore.state.loginAttempts >= 3) this._lockout();
            return { success: false, msg: "Credenciais Inválidas" };
        }
    }

    static _lockout() {
        appStore.state.isLocked = true;
        appStore.state.lockoutTimer = Date.now() + 30000;
    }

    static canAccess(feature) {
        const role = appStore.state.currentUser?.role;
        if (!role) return false;
        if (role === 'Administrador') return true;
        
        if (feature === 'admin') return false;
        if (feature === 'marketing') return role !== 'Visitante' && role !== 'Vendas externa';
        if (feature === 'perfil') return role !== 'Visitante';
        // Regra de Negócio: Vendas externa não pode dar desconto
        if (feature === 'discounts') return role !== 'Vendas externa';
        
        return true;
    }
}

/**
 * ==========================================
 * 4. VIEW RENDERER (Templates HTML)
 * ==========================================
 */
const ViewRenderer = {
    // Template do Dashboard (Layout Base)
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
        const isAdmin = u.role === 'Administrador';
        return `
        <aside id="sidebar-menu" class="fixed inset-y-0 left-0 w-72 bg-white dark:bg-zinc-900 shadow-2xl transform -translate-x-full lg:relative lg:translate-x-0 transition-transform duration-300 z-40 flex flex-col border-r border-gray-100 dark:border-zinc-800">
            <div class="p-8 border-b border-gray-100 dark:border-zinc-800 flex flex-col items-center">
                <div class="w-24 h-24 rounded-full bg-brand-orange text-white flex items-center justify-center font-bold text-3xl border-4 border-gray-50 dark:border-zinc-800 shadow-xl profile-avatar-div overflow-hidden mb-4" style="${u.avatar ? `background-image: url('${u.avatar}')` : ''}">${u.avatar ? '' : u.name[0]}</div>
                <p class="font-black text-sm text-slate-800 dark:text-white uppercase italic">${u.name}</p>
                <p class="text-[10px] text-brand-green font-bold uppercase tracking-widest mt-1">${u.role}</p>
            </div>
            <nav class="flex-1 px-4 py-6 space-y-2 overflow-y-auto hide-scrollbar">
                <button onclick="App.navigate('dashboard')" class="sidebar-link flex items-center w-full px-6 py-4 rounded-2xl font-bold transition-all text-sm uppercase tracking-tighter italic text-left">Dashboard</button>
                <button onclick="App.navigate('consultas')" class="sidebar-link flex items-center w-full px-6 py-4 rounded-2xl font-bold transition-all text-sm uppercase tracking-tighter italic text-left">Consultas Novos</button>
                <button onclick="App.navigate('usados')" class="sidebar-link flex items-center w-full px-6 py-4 rounded-2xl font-bold transition-all text-sm uppercase tracking-tighter italic text-left">Seminovos</button>
                ${AuthService.canAccess('marketing') ? `<button onclick="App.navigate('marketing')" class="sidebar-link flex items-center w-full px-6 py-4 rounded-2xl font-bold transition-all text-sm uppercase tracking-tighter italic text-left">Marketing</button>` : ''}
                <div class="pt-6 mt-2 border-t border-gray-100 dark:border-zinc-800 space-y-2">
                    ${isAdmin ? `<button onclick="App.navigate('admin')" class="sidebar-link flex items-center w-full px-6 py-4 rounded-2xl font-bold text-red-500 transition-all text-sm uppercase tracking-tighter italic text-left">Administração</button>` : ''}
                    ${AuthService.canAccess('perfil') ? `<button onclick="App.navigate('perfil')" class="sidebar-link flex items-center w-full px-6 py-4 rounded-2xl font-bold transition-all text-sm uppercase tracking-tighter italic text-slate-500 dark:text-zinc-400 text-left">Meu Perfil</button>` : ''}
                    <button onclick="App.navigate('sobre')" class="sidebar-link flex items-center w-full px-6 py-4 rounded-2xl font-bold transition-all text-sm uppercase tracking-tighter italic text-slate-400 dark:text-zinc-500 text-left">Sobre</button>
                </div>
            </nav>
        </aside>`;
    },

    _header: () => `
        <header class="h-20 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-b border-gray-100 dark:border-zinc-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
            <div class="flex items-center gap-3">
                <button onclick="document.getElementById('sidebar-menu').classList.remove('-translate-x-full'); document.getElementById('sidebar-overlay').style.display='block'" class="lg:hidden p-2 bg-gray-100 dark:bg-zinc-800 rounded-xl text-gray-600 dark:text-zinc-300"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke-width="2" stroke-linecap="round"></path></svg></button>
                <h1 id="page-title" class="text-lg sm:text-xl font-black text-slate-800 dark:text-white uppercase italic tracking-tighter">Galvão Drones</h1>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="Utils.toggleTheme()" class="p-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg></button>
                <button onclick="Utils.reload()" class="px-5 py-2.5 bg-brand-orange text-white font-black rounded-xl text-[10px] uppercase shadow-lg hover:bg-orange-600 active:scale-95 transition-all tracking-widest">Sair</button>
            </div>
        </header>
    `,

    _calculatorFab: () => `
        <button onclick="Modals.toggleCalculator()" class="fixed bottom-6 right-6 w-16 h-16 bg-brand-orange text-white rounded-full shadow-2xl flex items-center justify-center z-50 transition-all hover:scale-110 active:scale-90"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" stroke-width="2"></path></svg></button>
        <div id="calculator-popup" class="hidden fixed bottom-24 right-6 w-80 sm:w-96 glass-card rounded-[2rem] shadow-2xl border dark:border-zinc-700 p-6 z-50 origin-bottom-right">
            <div class="flex justify-between items-center mb-6"><h3 class="font-black text-brand-green dark:text-white uppercase italic text-xl">Simulador</h3><button onclick="Modals.toggleCalculator()" class="text-gray-400 text-2xl">×</button></div>
            <div class="space-y-4">
                <input type="number" id="popup-sale-value" placeholder="Valor Base (R$)" class="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 rounded-xl font-bold dark:text-white outline-none focus:ring-2 focus:ring-brand-orange">
                <div class="flex items-center gap-3 p-3 bg-brand-orange/5 rounded-xl border border-brand-orange/10"><input type="checkbox" id="popup-include-nf" class="w-5 h-5 rounded text-brand-orange"><label class="text-[10px] font-black uppercase text-slate-600 dark:text-zinc-300">Incluir NF (+6%)</label></div>
                <select id="popup-installments" class="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 rounded-xl font-bold text-sm dark:text-white outline-none"><option value="0">Selecionar parcelas...</option>${Object.keys(Config.installmentRates).map(i => `<option value="${i}">${i}x</option>`).join('')}</select>
                <div id="popup-calculator-results" class="hidden p-4 rounded-2xl bg-brand-green/5 space-y-2 border border-brand-green/10">
                    <div class="flex justify-between text-xs font-black italic uppercase"><span class="text-slate-600 dark:text-zinc-400">Total c/ Taxas:</span><span id="popup-total-value" class="dark:text-white"></span></div>
                    <div class="flex justify-between items-center text-brand-orange pt-2"><span class="text-xs font-black uppercase tracking-tighter">Parcela:</span><span id="popup-installment-value" class="text-xl font-black italic tracking-tighter dark:text-white"></span></div>
                </div>
                <button onclick="App.shareCalc()" class="w-full py-4 bg-green-500 text-white font-black rounded-2xl shadow-md uppercase text-[10px] tracking-widest">WhatsApp</button>
            </div>
        </div>
    `,

    // Páginas Internas
    pages: {
        dashboard: () => `
            <section class="space-y-6">
                <div class="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] shadow-sm border dark:border-zinc-800">
                    <h2 class="text-3xl font-black italic tracking-tighter text-slate-800 dark:text-white uppercase">Olá, <span class="text-brand-orange">${appStore.state.currentUser.name.split(' ')[0]}</span>!</h2>
                    <p class="text-gray-500 mt-2 font-bold uppercase tracking-widest text-[10px]">Central Goiânia | ${appStore.state.currentUser.role}</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${ViewRenderer._cardBtn('consultas', 'bg-emerald-50 text-brand-green', 'Catálogo Novos', 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z')}
                    ${ViewRenderer._cardBtn('usados', 'bg-blue-50 text-blue-600', 'Seminovos', 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15')}
                    ${AuthService.canAccess('marketing') ? ViewRenderer._cardBtn('marketing', 'bg-orange-50 text-brand-orange', 'Marketing', 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z') : ''}
                    ${AuthService.canAccess('perfil') ? ViewRenderer._cardBtn('perfil', 'bg-purple-50 text-purple-600', 'Meu Perfil', 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') : ''}
                    ${appStore.state.currentUser.role === 'Administrador' ? ViewRenderer._cardBtn('admin', 'bg-red-50 text-red-600', 'Gestão Admin', 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 00-1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 001.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z') : ''}
                </div>
            </section>
        `,

        catalog: () => {
            const prods = appStore.state.products;
            let html = `<div class="flex gap-3 mb-6"><div class="relative flex-1"><input type="text" onkeyup="ViewRenderer.filterGrid(this, '.product-card')" placeholder="Buscar drones novos..." class="w-full p-5 rounded-2xl border dark:border-zinc-800 outline-none focus:ring-2 focus:ring-brand-green bg-white dark:bg-zinc-900 text-sm font-bold shadow-sm uppercase dark:text-white"></div></div>`;
            if(!prods.length) return html + `<div class="p-10 text-center bg-white dark:bg-zinc-900 rounded-[2.5rem]"><p class="text-brand-orange font-black uppercase text-xs">Vazio</p></div>`;
            
            html += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
            html += prods.map(p => {
                const price = Utils.cleanCurrency(p.sell);
                const isVis = appStore.state.currentUser.role === 'Visitante';
                const actions = isVis 
                    ? `<button onclick="window.open('https://wa.me/55${Config.centralNumber}?text=Consultar ${p.name}', '_blank')" class="w-full mt-4 bg-brand-green text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg">Consultar</button>`
                    : `<div class="mt-4 flex flex-col gap-2"><button onclick="Modals.openAvailability('${p.name}')" class="w-full bg-brand-green text-white py-4 rounded-2xl font-black uppercase text-[9px] shadow-sm">Contato</button><button onclick="Modals.openShare('${p.name}', ${price})" class="w-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-white py-3 rounded-2xl font-bold uppercase text-[9px]">Compartilhar</button></div>`;
                
                return `
                <div class="product-card bg-white dark:bg-zinc-900 p-6 rounded-[2.5rem] border dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all text-left">
                    <h3 class="font-black text-brand-green dark:text-white uppercase italic text-xs tracking-tight">${p.name}</h3>
                    <p class="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest text-slate-400">${p.line || 'DJI'}</p>
                    ${!isVis ? `<div class="mt-4 pt-4 border-t dark:border-zinc-800"><p class="text-[8px] font-black text-gray-500 uppercase tracking-widest">Valor DJI</p><p class="text-2xl font-black text-brand-green dark:text-white italic tracking-tighter leading-none">${Utils.fmtBRL.format(price)}</p></div>` : ''}
                    ${actions}
                </div>`;
            }).join('');
            return html + `</div>`;
        },

        used: () => {
            const prods = appStore.state.usedProducts;
            let html = `<div class="flex gap-3 mb-6"><div class="relative flex-1"><input type="text" onkeyup="ViewRenderer.filterGrid(this, '.used-card')" placeholder="Buscar seminovos..." class="w-full p-5 rounded-2xl border dark:border-zinc-800 outline-none focus:ring-2 focus:ring-brand-green bg-white dark:bg-zinc-900 text-sm font-bold shadow-sm uppercase dark:text-white"></div></div>`;
            if(!prods.length) return html + `<div class="p-10 text-center bg-white dark:bg-zinc-900 rounded-[2.5rem]"><p class="text-brand-orange font-black uppercase text-xs">Vazio</p></div>`;

            html += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
            html += prods.map((p, idx) => {
                const price = Utils.cleanCurrency(p.price);
                const isVis = appStore.state.currentUser.role === 'Visitante';
                const img = (Array.isArray(p.images) ? p.images[0] : p.image) || '';
                const badgeColor = p.condition.includes('Seminovo') ? 'badge-seminovo' : p.condition.includes('Open') ? 'badge-openbox' : 'badge-revisado';
                
                return `
                <div class="used-card bg-white dark:bg-zinc-900 p-6 rounded-[2.5rem] border dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all text-left group relative" onclick="Modals.openUsedDetails(${idx})">
                    <div class="flex justify-between items-start mb-2"><span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${badgeColor}">${p.condition}</span></div>
                    <h3 class="font-black text-slate-800 dark:text-white uppercase italic text-lg tracking-tight mb-2">${p.name}</h3>
                    <div id="card-img-${idx}" class="w-full h-40 bg-gray-50 dark:bg-zinc-800 rounded-xl mb-4 bg-cover bg-center card-image-transition" style="background-image: url('${img}');"></div>
                    <div class="pt-4 border-t dark:border-zinc-800">
                        <p class="text-[8px] font-black text-gray-500 uppercase tracking-widest">Investimento</p>
                        <p class="text-2xl font-black text-brand-orange italic tracking-tighter leading-none">${isVis ? 'CONSULTE' : Utils.fmtBRL.format(price)}</p>
                    </div>
                </div>`;
            }).join('');
            return html + `</div>`;
        },

        marketing: () => {
            const assets = appStore.state.marketingAssets;
            let html = `<div class="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border dark:border-zinc-800 shadow-sm mb-6 text-center">
                <h2 class="text-2xl font-black text-brand-orange uppercase italic tracking-tighter">Marketing & Downloads</h2>
                <div class="flex flex-wrap gap-3 justify-center mt-6">
                    ${['postados', 'postar', 'editar'].map(key => `<button onclick="Modals.openDrive('${key}')" class="px-6 py-3 bg-brand-green text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-800 transition-all shadow-md">${key}</button>`).join('')}
                </div>
            </div>`;
            
            html += `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">`;
            html += assets.map((m, idx) => `
                <div class="bg-white dark:bg-zinc-900 p-4 rounded-[2rem] border dark:border-zinc-800 flex flex-col items-center text-center shadow-sm hover:shadow-lg transition-all cursor-pointer" onclick="Modals.openMarketing(${idx})">
                    <div class="w-20 h-20 mb-3 rounded-full bg-gray-50 dark:bg-zinc-800 flex items-center justify-center text-3xl overflow-hidden border-2 border-transparent hover:border-brand-orange transition-colors"><img src="${m.preview || 'https://imgur.com/2PNy5CS.png'}" class="w-full h-full object-cover"></div>
                    <h4 class="font-bold text-xs uppercase text-slate-800 dark:text-white leading-tight mb-1">${m.title}</h4>
                    <p class="text-[9px] text-gray-500 uppercase tracking-widest mb-3">${m.type}</p>
                </div>`).join('');
            return html + `</div>`;
        },

        profile: () => {
            const u = appStore.state.currentUser;
            return `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-1 bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border dark:border-zinc-800 text-center shadow-sm flex flex-col items-center">
                    <div class="relative w-32 h-32 mx-auto rounded-full bg-gray-100 dark:bg-zinc-800 border-4 border-brand-orange shadow-2xl flex items-center justify-center bg-cover bg-center overflow-hidden profile-avatar-div" style="background-image: url('${u.avatar||''}');"></div>
                    <div class="mt-8 mb-4"><div class="w-40 h-40 rounded-3xl border-4 border-brand-green/30 p-2 bg-white flex items-center justify-center shadow-inner overflow-hidden"><img id="profile-qrcode" class="w-full h-full opacity-0 transition-opacity duration-500"></div></div>
                    <div class="mt-4 flex flex-col items-center gap-2"><label class="switch"><input type="checkbox" id="qr-central-check" onchange="ProfileController.genQRCode()"><span class="slider"></span></label><span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Usar Contato Central</span></div>
                    <div class="mt-6"><h3 class="text-2xl font-black dark:text-white uppercase italic tracking-tighter">${u.name}</h3><p class="text-brand-orange font-bold uppercase text-[10px] tracking-widest">${u.role}</p></div>
                </div>
                <div class="lg:col-span-2 bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border dark:border-zinc-800 shadow-sm space-y-6 text-left">
                    <div><label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">Nome Completo</label><input value="${u.name}" class="w-full p-4 bg-gray-50 dark:bg-zinc-800 rounded-2xl font-bold text-sm dark:text-white" readonly></div>
                    <div><label class="block text-[10px] font-bold uppercase text-gray-500 mb-1">WhatsApp</label><input value="${u.phone || ''}" class="w-full p-4 bg-gray-50 dark:bg-zinc-800 rounded-2xl font-bold text-sm dark:text-white" readonly></div>
                </div>
            </div>`;
        },

        admin: () => {
            const makeList = (t, items, type, rowFn) => `<div class="bg-white dark:bg-zinc-900 rounded-[2rem] border dark:border-zinc-800 overflow-hidden flex flex-col h-[500px]"><div class="p-5 border-b dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 flex justify-between items-center"><h3 class="font-black uppercase text-[10px] tracking-widest text-brand-green italic">${t}</h3><button onclick="AdminController.openForm('${type}')" class="p-2 bg-brand-green text-white rounded-lg active:scale-90"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" stroke-width="3"></path></svg></button></div><div class="flex-1 overflow-y-auto p-4 space-y-2 hide-scrollbar">${items.map((it, i) => `<div class="flex items-center justify-between p-3 border-b dark:border-zinc-800 text-left">${rowFn(it)}<div class="flex gap-1"><button onclick="AdminController.openForm('${type}', ${i})" class="text-blue-500"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg></button><button onclick="AdminController.delete('${type}', ${i})" class="text-red-500"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9z"></path></svg></button></div></div>`).join('')}</div></div>`;
            
            return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">` +
                makeList("Equipe", appStore.state.users, 'user', u => `<div class="overflow-hidden"><p class="text-xs font-bold truncate dark:text-white">${u.name}</p><p class="text-[9px] text-gray-500 uppercase">${u.role}</p></div>`) +
                makeList("Novos", appStore.state.products, 'product', p => `<div class="overflow-hidden"><p class="text-xs font-bold truncate dark:text-white">${p.name}</p><p class="text-[9px] text-brand-green font-bold">${p.sell}</p></div>`) +
                makeList("Usados", appStore.state.usedProducts, 'used', u => `<div class="overflow-hidden"><p class="text-xs font-bold truncate dark:text-white">${u.name}</p><p class="text-[9px] text-brand-orange">${u.condition}</p></div>`) +
                makeList("Mkt", appStore.state.marketingAssets, 'marketing', m => `<div class="overflow-hidden"><p class="text-xs font-bold truncate dark:text-white">${m.title}</p><p class="text-[9px] text-gray-500">${m.type}</p></div>`) +
            `</div>`;
        },

        about: () => `<div class="bg-white dark:bg-zinc-900 p-10 rounded-[2.5rem] border dark:border-zinc-800 text-center space-y-6 shadow-sm"><img src="https://imgur.com/2PNy5CS.png" class="h-24 mx-auto mb-4" alt="Logo"><h2 class="text-3xl font-black text-brand-green uppercase italic tracking-tighter">Galvão Drones | Goiânia</h2><p class="text-gray-600 dark:text-gray-400 leading-relaxed font-medium italic">Especialistas em manutenção, vendas e treinamento DJI no Brasil.</p></div>`,

        _cardBtn: (p, c, t, i) => `<button onclick="App.navigate('${p}')" class="p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border dark:border-zinc-800 hover:shadow-xl transition-all flex flex-col items-center group active:scale-95 w-full"><div class="p-5 rounded-3xl mb-4 transition-all shadow-inner ${c} dark:bg-opacity-10"><svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="${i}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></div><span class="font-black uppercase text-xs dark:text-white tracking-widest italic">${t}</span></button>`,

        filterGrid: (input, selector) => {
            const term = input.value.toLowerCase();
            document.querySelectorAll(selector).forEach(c => c.style.display = c.innerText.toLowerCase().includes(term) ? 'block' : 'none');
        },

        startCarousels: () => {
            appStore.state.intervals.forEach(clearInterval);
            appStore.state.usedProducts.forEach((p, idx) => {
                const imgs = Array.isArray(p.images) ? p.images : [p.image];
                if(imgs.length > 1) {
                    let c = 0; const el = document.getElementById(`card-img-${idx}`);
                    if(el) appStore.state.intervals.push(setInterval(() => { c=(c+1)%imgs.length; el.style.backgroundImage=`url('${imgs[c]}')`; }, 3000));
                }
            });
        }
    }
};

/**
 * ==========================================
 * 5. CONTROLADORES E MODAIS
 * ==========================================
 */
const Modals = {
    open: (id) => document.getElementById(id).classList.remove('hidden'),
    close: (id) => document.getElementById(id).classList.add('hidden'),
    toggleCalculator: () => document.getElementById('calculator-popup').classList.toggle('hidden'),

    openDrive: (key) => {
        const url = Config.driveLinks[key];
        if(url) {
            const m = document.getElementById('drive-webview-modal');
            const iframe = document.getElementById('drive-iframe');
            document.getElementById('drive-loader').classList.remove('hidden');
            iframe.src = url;
            document.getElementById('drive-external-link').href = url;
            m.classList.remove('hidden');
        } else alert("Link não configurado.");
    },

    openMarketing: (idx) => {
        const m = appStore.state.marketingAssets[idx];
        document.getElementById('mkt-modal-title').textContent = m.title;
        const vars = m.variations || [{name: 'Padrão', url: m.downloadUrl}];
        document.getElementById('mkt-variations-list').innerHTML = vars.map(v => `
            <label class="relative flex items-center p-3 rounded-xl bg-gray-50 dark:bg-zinc-800 cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-zinc-700 group overflow-hidden">
                <input type="checkbox" value="${v.url}" class="peer sr-only mkt-checkbox-input">
                <div class="absolute inset-0 border-2 border-transparent peer-checked:border-brand-orange peer-checked:bg-brand-orange/5 rounded-xl pointer-events-none transition-all"></div>
                <span class="flex-1 text-xs font-bold text-slate-700 dark:text-white uppercase relative z-10 ml-2">${v.name}</span>
                <div class="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-zinc-500 peer-checked:bg-brand-orange peer-checked:border-brand-orange flex items-center justify-center transition-all relative z-10"><svg class="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>
            </label>
        `).join('');
        Modals.open('marketing-modal');
    },

    openShare: (name, price) => {
        appStore.state.currentShareProduct = { name, price };
        document.getElementById('share-product-name').textContent = name;
        Modals.setShareMode('vista');
        Modals.open('share-modal');
    },

    setShareMode: (mode) => {
        appStore.state.shareMode = mode;
        const container = document.getElementById('share-input-container');
        const btns = { vista: document.getElementById('btn-mode-vista'), parcelado: document.getElementById('btn-mode-parcelado') };
        const active = ['bg-white', 'shadow-sm', 'text-brand-orange']; const inactive = ['text-gray-400', 'hover:text-gray-600'];
        Object.keys(btns).forEach(k => { if (k === mode) { btns[k].classList.remove(...inactive); btns[k].classList.add(...active); } else { btns[k].classList.remove(...active); btns[k].classList.add(...inactive); } });

        if (mode === 'vista') {
            container.innerHTML = `<div class="text-left"><label class="block text-[10px] font-bold uppercase text-gray-400 mb-2 pl-1">Desconto (%)</label><input type="number" id="share-discount" placeholder="Ex: 5" min="0" max="10" class="w-full rounded-2xl border-0 bg-gray-100 dark:bg-zinc-800 px-5 py-4 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-orange font-bold outline-none text-center text-lg"></div>`;
        } else {
            const opts = Object.keys(Config.installmentRates).map(i => `<option value="${i}">${i}x</option>`).join('');
            container.innerHTML = `<div class="text-left"><label class="block text-[10px] font-bold uppercase text-gray-400 mb-2 pl-1">Parcelamento</label><select id="share-installments" class="w-full rounded-2xl border-0 bg-gray-100 dark:bg-zinc-800 px-5 py-4 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-orange font-bold outline-none text-center text-lg appearance-none">${opts}</select></div>`;
        }
    },

    confirmShare: () => {
        const { name, price } = appStore.state.currentShareProduct;
        const mode = appStore.state.shareMode;
        const resVal = price * 0.30;
        
        // Bloqueio de desconto para Vendas Externa
        if (!AuthService.canAccess('discounts') && mode === 'vista') {
            const d = parseFloat(document.getElementById('share-discount')?.value || 0);
            if (d > 0) { UI.showError('Para aplicar desconto, entre em contato com a administração.'); return; }
        }

        let details = "";
        if (mode === 'vista') {
            let d = parseFloat(document.getElementById('share-discount').value || 0);
            if (d > 10) d = 10;
            if (d > 0) details = `\n\n🔥 *Condição à Vista:* ${d}% OFF\n✅ *VALOR COM DESCONTO:* *${Utils.fmtBRL.format(price * (1 - d/100))}*`;
        } else {
            const n = parseInt(document.getElementById('share-installments').value);
            const rate = Config.installmentRates[n] || 0;
            const total = price * (1 + rate/100);
            if(n) details = `\n\n💳 *Condição Parcelada:* ${n}x\n*Parcela:* ${Utils.fmtBRL.format(total/n)}\n*Total:* ${Utils.fmtBRL.format(total)}`;
        }

        const msg = `🚀 *PROPOSTA GALVÃO DRONES*\n\n*Produto:* ${name}\n*Valor Base:* ${Utils.fmtBRL.format(price)}${details}\n\n📉 *Sinal de Reserva (30%):* *${Utils.fmtBRL.format(resVal)}* (Abatido no total / Não reembolsável)\n\n🎁 *Bônus Especial:*\nAo investir conosco, você ganha uma *AULA DE PILOTAGEM* prática presencial.`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        Modals.close('share-modal');
    },

    openUsedDetails: (idx) => {
        appStore.state.currentUsedIdx = idx; const p = appStore.state.usedProducts[idx]; const images = Array.isArray(p.images) ? p.images : [p.image]; const d = p.details || {};
        document.getElementById('modal-used-title').textContent = p.name; document.getElementById('modal-used-desc').textContent = p.desc;
        document.getElementById('modal-used-price').textContent = appStore.state.currentUser.role === 'Visitante' ? 'CONSULTE' : Utils.fmtBRL.format(Utils.cleanCurrency(p.price));
        document.getElementById('modal-used-main-img').style.backgroundImage = `url('${images[0]}')`;
        document.getElementById('modal-used-thumbnails').innerHTML = images.map(img => `<div class="w-20 h-20 flex-shrink-0 bg-gray-100 dark:bg-zinc-800 rounded-xl bg-cover bg-center border-2 border-transparent hover:border-brand-orange cursor-pointer" style="background-image: url('${img}')" onclick="document.getElementById('modal-used-main-img').style.backgroundImage = 'url(\\'${img}\\')'"></div>`).join('');
        const bats = d.batteries || []; document.getElementById('modal-used-batteries').innerHTML = bats.length ? bats.map((c, i) => `<div class="flex flex-col items-center p-3 bg-white dark:bg-zinc-900 rounded-xl border dark:border-zinc-700 w-20"><span class="text-[10px] font-black text-gray-500 uppercase">Bat ${i+1}</span><span class="text-sm font-bold dark:text-white">${c}</span></div>`).join('') : '<span class="text-xs text-gray-400">Sem info</span>';
        document.getElementById('modal-used-init-contact').classList.remove('hidden'); document.getElementById('modal-used-options').classList.add('hidden');
        Modals.open('used-details-modal');
    },

    openAvailability: (name) => {
        appStore.state.currentProduct = name; document.getElementById('modal-product-name').textContent = name;
        document.getElementById('modal-sellers-list').innerHTML = Object.keys(Config.contacts).map(k => `<label class="vendedor-option block cursor-pointer group"><input type="checkbox" name="vend_chk" value="${k}" class="hidden"><div class="p-4 border-2 border-gray-100 dark:border-zinc-800 rounded-2xl flex justify-between transition-all"><span class="block font-black text-sm dark:text-white uppercase">${k.toUpperCase()}</span><div class="check-indicator w-5 h-5 border-2 rounded-full"></div></div></label>`).join('');
        Modals.open('availability-modal');
    }
};

const App = {
    init: async () => {
        await appStore.loadData();
        Bypass.init();
        const storedUser = localStorage.getItem('gd_user');
        const storedPass = localStorage.getItem('gd_pass');
        if (storedUser && storedPass) {
            const result = await AuthService.login(storedUser, storedPass);
            if (result.success) { App.renderApp(); return; }
        }
        App.renderLogin();
        App.setupCalculator();
    },

    renderLogin: () => {
        document.getElementById('app-root').innerHTML = Templates.login();
        document.getElementById('modals-container').innerHTML = Templates.getModals();
    },

    renderApp: () => {
        document.getElementById('app-root').innerHTML = ViewRenderer.dashboardLayout();
        document.getElementById('modals-container').innerHTML = Templates.getModals();
        App.navigate('dashboard');
        App.setupCalculator();
    },

    handleLogin: async (e) => {
        e.preventDefault();
        const u = document.getElementById('username-input').value;
        const p = document.getElementById('password-input').value;
        const rem = document.getElementById('remember-me').checked;
        const res = await AuthService.login(u, p);
        if (res.success) {
            if (rem && u !== 'tecnico_bypass') { localStorage.setItem('gd_user', u); localStorage.setItem('gd_pass', p); }
            App.renderApp();
        } else {
            const el = document.getElementById('error-message');
            el.textContent = res.msg; el.classList.remove('hidden');
            if(appStore.state.isLocked) { document.getElementById('btn-login-submit').disabled = true; }
        }
    },

    handleVisitorLogin: async () => {
        await AuthService.login("consultas", "");
        appStore.setUser({ name: "Visitante", role: "Visitante", username: "consultas" });
        App.renderApp();
    },

    navigate: (page) => {
        if(page === 'admin' && !appStore.state.adminSession) { Modals.open('admin-login-modal'); AdminController.initLogin(); return; }
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        const activeLinks = document.querySelectorAll(`button[onclick="App.navigate('${page}')"]`);
        activeLinks.forEach(l => l.classList.add('active'));
        document.getElementById('page-title').textContent = page.toUpperCase().replace('-', ' ');
        const container = document.getElementById('main-content');
        let html = '';
        switch(page) {
            case 'dashboard': html = ViewRenderer.dashboard(); break;
            case 'consultas': html = ViewRenderer.catalog(); break;
            case 'usados': html = ViewRenderer.used(); break;
            case 'marketing': html = ViewRenderer.marketing(); break;
            case 'perfil': html = ViewRenderer.profile(); break;
            case 'admin': html = ViewRenderer.admin(); break;
            case 'sobre': html = ViewRenderer.about(); break;
        }
        container.innerHTML = html;
        if(page === 'perfil') setTimeout(() => ProfileController.genQRCode(), 100);
        if(page === 'usados') ViewRenderer.startCarousels();
        document.getElementById('sidebar-menu').classList.add('-translate-x-full');
        document.getElementById('sidebar-overlay').style.display = 'none';
    },

    setupCalculator: () => {
        const inp = document.getElementById('popup-sale-value'); const sel = document.getElementById('popup-installments');
        if(!inp || !sel) return;
        const calc = () => {
            const v = parseFloat(inp.value) || 0; const i = parseInt(sel.value) || 0; const nf = document.getElementById('popup-include-nf').checked ? 1.06 : 1;
            if(v > 0 && i > 0) {
                const total = (v * nf) * (1 + (Config.installmentRates[i] || 0)/100);
                document.getElementById('popup-total-value').textContent = Utils.fmtBRL.format(total);
                document.getElementById('popup-installment-value').textContent = `${i}x de ${Utils.fmtBRL.format(total/i)}`;
                document.getElementById('popup-calculator-results').classList.remove('hidden');
            }
        };
        inp.oninput = calc; sel.onchange = calc; document.getElementById('popup-include-nf').onchange = calc;
    },

    shareCalc: () => {
        const total = document.getElementById('popup-total-value').textContent;
        window.open(`https://wa.me/?text=${encodeURIComponent("*Simulação Galvão Drones*\nTotal: "+total)}`, '_blank');
    }
};

const Templates = {
    login: () => `...`, // Copiar o conteúdo HTML do template de login aqui se necessário, ou usar do arquivo anterior
    getModals: () => `
        <!-- Coloque aqui todo o HTML dos modais (admin, share, used-details, marketing, availability) que estavam no final do arquivo HTML original -->
        <!-- Devido ao limite de caracteres, mantenha a estrutura dos modais idêntica ao arquivo original -->
    `
};

const ProfileController = {
    genQRCode: () => {
        const isCentral = document.getElementById('qr-central-check').checked;
        const phone = isCentral ? Config.centralNumber : (appStore.state.currentUser?.phone || Config.centralNumber);
        const qrImg = document.getElementById('profile-qrcode');
        if (!qrImg) return;
        const waLink = `https://wa.me/55${phone.replace(/\D/g, '')}`;
        const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(waLink)}&bgcolor=ffffff&color=0E5847&margin=10&format=png`;
        qrImg.classList.add('opacity-0'); qrImg.src = apiUrl; qrImg.onload = () => qrImg.classList.remove('opacity-0');
    }
};

const ContactController = {
    sendUsed: () => {
        const p = appStore.state.usedProducts[appStore.state.currentUsedIdx];
        const msg = appStore.state.contactOption === 'reserve' ? 
            `🛑 *RESERVA:* ${p.name} (${p.condition}) - Cliente: ${document.getElementById('res-name-used').value}` :
            `🔍 *CONSULTA:* ${p.name} (${p.condition})`;
        window.open(`https://wa.me/55${Config.centralNumber}?text=${encodeURIComponent(msg)}`, '_blank');
    },
    sendAvailability: () => {
        const sel = Array.from(document.querySelectorAll('input[name="vend_chk"]:checked')).map(c=>c.value);
        if(!sel.length) return alert('Selecione vendedor');
        const msg = `🔍 *CONSULTA:* ${appStore.state.currentProduct}`;
        sel.forEach(s => window.open(`https://wa.me/55${Config.contacts[s]}?text=${encodeURIComponent(msg)}`, '_blank'));
        Modals.close('availability-modal');
    }
};

const AdminController = {
    buffer: "",
    initLogin: () => {
        AdminController.buffer = ""; 
        document.getElementById('keypad-display').textContent = ""; 
        const vk = document.getElementById('virtual-keypad'); vk.innerHTML = '';
        [0,1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5).forEach(n => { const b=document.createElement('button'); b.className='key-btn'; b.textContent=n; b.onclick=()=>AdminController.key(n); vk.appendChild(b); });
    },
    key: (n) => {
        AdminController.buffer += n; 
        document.getElementById('keypad-display').textContent = "*".repeat(AdminController.buffer.length);
        if(AdminController.buffer === appStore.state.passwords.admin) { appStore.setAdminSession(true); Modals.close('admin-login-modal'); App.navigate('admin'); }
    },
    openForm: (type, idx=null) => {
        appStore.state.adminEdit = {type, index: idx};
        document.getElementById('admin-modal-title').textContent = (idx!==null ? 'Editar ' : 'Novo ') + type;
        let html = '';
        if(type === 'user') { const d = idx!==null ? appStore.state.users[idx] : {}; html = `<input id="af-name" value="${d.name||''}" placeholder="Nome" class="w-full p-4 mb-3 border rounded-xl"><select id="af-role" class="w-full p-4 mb-3 border rounded-xl"><option value="Vendedor">Vendedor</option><option value="Vendas externa">Vendas externa</option><option value="Técnico">Técnico</option><option value="Administrador">Administrador</option></select>`; }
        // ... (resto dos forms)
        document.getElementById('admin-dynamic-form').innerHTML = html;
        Modals.open('admin-form-modal');
    },
    save: () => { Modals.close('admin-form-modal'); App.navigate('admin'); },
    delete: (type, idx) => { appStore.state.deleteTarget = {type, index:idx}; Modals.open('delete-confirm-modal'); },
    confirmDelete: () => { appStore.deleteItem(appStore.state.deleteTarget.type, appStore.state.deleteTarget.index); Modals.close('delete-confirm-modal'); App.navigate('admin'); }
};

const Bypass = {
    clicks: 0, timer: null,
    init: () => {
        const l = document.getElementById('login-logo-trigger');
        if(l) l.onclick = () => { clearTimeout(Bypass.timer); Bypass.clicks++; if(Bypass.clicks>=5) { Modals.open('bypass-login-modal'); Bypass.initKeypad(); Bypass.clicks=0; } Bypass.timer=setTimeout(()=>Bypass.clicks=0, 1500); }
    },
    initKeypad: () => {
        const vk = document.getElementById('bypass-virtual-keypad'); vk.innerHTML = '';
        [1,2,3,4,5,6,7,8,9,0].forEach(n => { const b=document.createElement('button'); b.className='key-btn'; b.textContent=n; b.onclick=()=>Bypass.key(n); vk.appendChild(b); });
    },
    key: (n) => { /* Lógica Bypass */ }
};

document.addEventListener('DOMContentLoaded', App.init);
