import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onChildChanged, onValue, set, onDisconnect, remove, update as dbUpdate, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYzLoNr3aS71H4qWAnm5dgUYzhyrSum20",
  authDomain: "clashbattle-5e0b1.firebaseapp.com",
  databaseURL: "https://clashbattle-5e0b1-default-rtdb.firebaseio.com",
  projectId: "clashbattle-5e0b1",
  storageBucket: "clashbattle-5e0b1.firebasestorage.app",
  messagingSenderId: "715854969334",
  appId: "1:715854969334:web:69d0bb0075629735b22fd7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const playerId = Math.random().toString(36).substring(7);

let playerRole = null, isHost = false, isBotMode = false, isSpectator = false; 
let myNickname = localStorage.getItem('bbr_nick') || null;
let myPassword = localStorage.getItem('bbr_pass') || null;
let myNickChanges = parseInt(localStorage.getItem('bbr_nick_changes')) || 0; // Лимит смены ника

let myTrophies = parseInt(localStorage.getItem('bbr_trophies')) || 0;
let myBotTrophies = parseInt(localStorage.getItem('bbr_bot_trophies')) || 0;
let battleHistory = JSON.parse(localStorage.getItem('bbr_history')) || [];

let gamePath = "match_v106_final"; 
let unitsRef, eventsRef, towersRef, stateRef, activeMatchesRef;

function rebindFirebaseRefs() {
    unitsRef = ref(db, `${gamePath}/units`);
    eventsRef = ref(db, `${gamePath}/events`);
    towersRef = ref(db, `${gamePath}/towers`);
    stateRef = ref(db, `${gamePath}/state`);
    activeMatchesRef = ref(db, `active_matches`);
}
rebindFirebaseRefs();

async function clearMatchData() { await remove(ref(db, gamePath)); }

let elixir = 5, elixirText, selectedCardObj = null, isGameOver = false;
let unitsMap = {}, towerGroup, projectiles, hpBarsGroup, roleText;
let timerText, phaseText, lastLogic = 0, elixirBar, elixirFill;
let gameState = { phase: '1x', startTime: 0, isOvertime: false, tiebreakerStarted: false, overtimeDecided: false };

window.allCardsData = [
    {id:'knight', c:3, color:0x3498db}, {id:'giant', c:5, color:0xe67e22},
    {id:'archers', c:3, color:0xe84393}, {id:'fireball', c:4, color:0xe74c3c},
    {id:'goblins', c:2, color:0x1abc9c}, {id:'minipekka', c:4, color:0x34495e}, 
    {id:'log', c:2, color:0xd35400}, {id:'cannon', c:3, color:0x7f8c8d},
    {id:'arrows', c:3, color:0x5d4037}, {id:'minions', c:3, color:0x2980b9},
    {id:'skeletons', c:1, color:0xbdc3c7}, {id:'prince', c:5, color:0x8e44ad},
    {id:'goblinbarrel', c:3, color:0xa0522d}, {id:'speargoblins', c:2, color:0x2ecc71},
    {id:'goblingang', c:3, color:0x27ae60}, {id:'inferno', c:5, color:0xd35400}, 
    {id:'rocket', c:6, color:0x8b0000}, {id:'icespirit', c:1, color:0x87CEEB},
    {id:'valkyrie', c:4, color:0xe67e22} 
];

// КРАСИВЫЕ НАЗВАНИЯ ДЛЯ КАРТ
const cardNames = {
    knight: 'РЫЦАРЬ', giant: 'ГИГАНТ', archers: 'ЛУЧНИЦЫ', fireball: 'ФАЕРБОЛ',
    goblins: 'ГОБЛИНЫ', minipekka: 'М.ПЕККА', log: 'БРЕВНО', cannon: 'ПУШКА',
    arrows: 'СТРЕЛЫ', minions: 'МИНЬОНЫ', skeletons: 'СКЕЛЕТЫ', prince: 'ПРИНЦ',
    goblinbarrel: 'БОЧКА', speargoblins: 'КОПЕЙЩИКИ', goblingang: 'БАНДА', 
    inferno: 'ИНФЕРНО', rocket: 'РАКЕТА', icespirit: 'ЛЕД.ДУХ', valkyrie: 'ВАЛЬКИРИЯ'
};

let savedDecks = JSON.parse(localStorage.getItem('bbr_decks')) || [[null,null,null,null,null,null,null,null], [null,null,null,null,null,null,null,null], [null,null,null,null,null,null,null,null], [null,null,null,null,null,null,null,null]];
let activeDeckIdx = parseInt(localStorage.getItem('bbr_active_deck')) || 0;
window.userDeck = savedDecks[activeDeckIdx];
let copiedDeck = JSON.parse(localStorage.getItem('bbr_copied')) || null;

function saveDecksData() { savedDecks[activeDeckIdx] = window.userDeck; localStorage.setItem('bbr_decks', JSON.stringify(savedDecks)); localStorage.setItem('bbr_active_deck', activeDeckIdx); }

const config = { type: Phaser.AUTO, parent: 'game', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 400, height: 800 }, physics: { default: 'arcade', arcade: { debug: false } } };

// --- КРАСИВОЕ ВСПЛЫВАЮЩЕЕ ОКНО АВТОРИЗАЦИИ ---
function showLoginModal(isChange, callback) {
    if(document.getElementById('loginOverlay')) return;
    let ov = document.createElement('div');
    ov.id = 'loginOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;z-index:9999;font-family:sans-serif;';
    
    let box = document.createElement('div');
    box.style.cssText = 'background:#2c3e50;border:4px solid #2ecc71;border-radius:20px;padding:30px;width:320px;text-align:center;box-shadow: 0 0 30px #000; box-sizing:border-box;';
    
    let title = document.createElement('h2');
    title.innerText = isChange ? 'СМЕНА НИКА' : 'ДОБРО ПОЖАЛОВАТЬ';
    title.style.cssText = 'color:#fff;margin-top:0;margin-bottom:20px;font-size:22px;';
    
    let nInp = document.createElement('input');
    nInp.placeholder = 'Ник (4-15 симв.)';
    nInp.maxLength = 15;
    nInp.style.cssText = 'width:100%;padding:14px;margin-bottom:15px;border-radius:10px;border:none;box-sizing:border-box;font-size:16px;text-align:center;background:#ecf0f1;outline:none;';
    
    let pInp = document.createElement('input');
    pInp.type = 'password';
    pInp.placeholder = 'Пароль (1-10 симв.)';
    pInp.maxLength = 10;
    pInp.style.cssText = 'width:100%;padding:14px;margin-bottom:25px;border-radius:10px;border:none;box-sizing:border-box;font-size:16px;text-align:center;background:#ecf0f1;outline:none;';
    
    let btn = document.createElement('button');
    btn.innerText = 'ПРОДОЛЖИТЬ';
    btn.style.cssText = 'background:#27ae60;color:#fff;border:none;padding:15px;width:100%;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;';
    
    box.append(title, nInp, pInp, btn);
    
    if(isChange) {
        let cancel = document.createElement('button');
        cancel.innerText = 'ОТМЕНА';
        cancel.style.cssText = 'background:#e74c3c;color:#fff;border:none;padding:12px;width:100%;border-radius:10px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:10px;';
        cancel.onclick = () => ov.remove();
        box.append(cancel);
    }
    
    ov.append(box);
    document.body.append(ov);
    
    btn.onclick = () => {
        let nv = nInp.value.trim(); let pv = pInp.value.trim();
        if(nv.length < 4 || nv.length > 15) return alert("Ник от 4 до 15 символов!");
        if(pv.length < 1 || pv.length > 10) return alert("Пароль от 1 до 10 символов!");
        if(!/^[a-zA-Zа-яА-Я0-9]+$/.test(nv)) return alert("Только буквы и цифры!");
        callback(nv, pv, ov);
    };
}
const MenuScene = {
    key: 'MenuScene',
    create: function() {
        let self = this;
        
        // --- 1. ФОН И РУБАШКА МЕНЮ ---
        this.add.rectangle(200, 400, 400, 800, 0x49B8C4); 
        let bgGraphics = this.add.graphics();
        bgGraphics.lineStyle(6, 0x3F9FA9, 1); 
        bgGraphics.beginPath();
        for(let i = -800; i < 1200; i += 50) {
            bgGraphics.moveTo(i, 0); bgGraphics.lineTo(i + 800, 800); 
            bgGraphics.moveTo(i + 800, 0); bgGraphics.lineTo(i, 800); 
        }
        bgGraphics.strokePath();

        let battleTab = this.add.container(0, 0);
        let deckTab = this.add.container(0, 0).setVisible(false);

        // --- 2. СИСТЕМА АВТОРИЗАЦИИ ЧЕРЕЗ HTML ОКНО ---
        let authenticateUser = async () => {
            if (!myNickname) {
                showLoginModal(false, async (n, p, modalNode) => {
                    const userRef = ref(db, `users/${n}`);
                    const snap = await get(userRef);

                    if (snap.exists()) {
                        if (p === snap.val().password) {
                            alert("Успешный вход! С возвращением, " + n);
                            myNickname = n; myPassword = p;
                            myTrophies = snap.val().trophies || 0;
                            myBotTrophies = snap.val().botTrophies || 0;
                            battleHistory = snap.val().history || [];
                            myNickChanges = snap.val().nickChanges || 0;
                            
                            localStorage.setItem('bbr_nick', myNickname);
                            localStorage.setItem('bbr_pass', myPassword);
                            localStorage.setItem('bbr_nick_changes', myNickChanges);
                            if (self.trophyText) self.trophyText.setText(`🏆 ${myTrophies}   |   🤖 ${myBotTrophies}`);
                            if (self.nickText) self.nickText.setText(`👤 ${myNickname}`);
                            modalNode.remove();
                        } else {
                            alert("Неверный пароль! Попробуй еще раз.");
                        }
                    } else {
                        myNickname = n; myPassword = p; myNickChanges = 0;
                        await set(userRef, { password: p, trophies: myTrophies, botTrophies: myBotTrophies, history: battleHistory, nickChanges: 0 });
                        localStorage.setItem('bbr_nick', myNickname);
                        localStorage.setItem('bbr_pass', myPassword);
                        localStorage.setItem('bbr_nick_changes', 0);
                        alert("Аккаунт успешно создан!");
                        if (self.trophyText) self.trophyText.setText(`🏆 ${myTrophies}   |   🤖 ${myBotTrophies}`);
                        if (self.nickText) self.nickText.setText(`👤 ${myNickname}`);
                        modalNode.remove();
                    }
                });
            }
        };
        authenticateUser();

        // --- 3. ИНТЕРФЕЙС БОЕВОЙ ВКЛАДКИ ---
        battleTab.add(this.add.rectangle(200, 100, 320, 60, 0x111922, 0.8).setStrokeStyle(3, 0xf1c40f));
        battleTab.add(this.add.text(200, 100, 'BUBABATTLE ROYALE', { fontSize: '26px', fill: '#f1c40f', fontStyle: 'bold' }).setOrigin(0.5));
        
        battleTab.add(this.add.rectangle(200, 170, 280, 40, 0x2C3E50, 0.9).setStrokeStyle(2, 0xf1c40f));
        self.trophyText = this.add.text(200, 170, `🏆 ${myTrophies}   |   🤖 ${myBotTrophies}`, { fontSize: '20px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        battleTab.add(self.trophyText);
        
        self.nickText = this.add.text(200, 210, `👤 ${myNickname || 'Гость'}`, { fontSize: '18px', fill: '#bdc3c7', fontStyle: 'bold' }).setOrigin(0.5);
        battleTab.add(self.nickText);

        let btnBattle = this.add.rectangle(150, 400, 180, 100, 0xe74c3c).setInteractive().setStrokeStyle(4, 0xc0392b);
        let txtBattle = this.add.text(150, 400, 'В БОЙ\n(Онлайн)', { fontSize: '24px', fill: '#fff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
        let btnBot = this.add.rectangle(300, 400, 80, 100, 0x9b59b6).setInteractive().setStrokeStyle(4, 0x8e44ad);
        let txtBot = this.add.text(300, 400, 'БОТ\n🤖', { fontSize: '22px', fill: '#fff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
        battleTab.add([btnBattle, txtBattle, btnBot, txtBot]);

        // --- 4. КНОПКА ⚙️ И НАСТРОЙКИ (С ИСПРАВЛЕННЫМ КЛИКОМ) ---
        let settingsBtn = this.add.text(360, 40, '⚙️', { fontSize: '30px' }).setInteractive().setOrigin(0.5);
        battleTab.add(settingsBtn);
        
        let settingsModal = this.add.container(200, 400).setDepth(1000).setVisible(false);
        let overlay = this.add.rectangle(0, 0, 400, 800, 0x000000, 0.6).setInteractive();
        overlay.on('pointerdown', () => settingsModal.setVisible(false));
        
        let modalBg = this.add.rectangle(0, 0, 300, 350, 0x2c3e50).setStrokeStyle(4, 0xf1c40f);
        let titleS = this.add.text(0, -140, 'ГЛАВНОЕ МЕНЮ', { fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5);
        
        let btnS = this.add.rectangle(0, -40, 240, 50, 0x34495e).setInteractive().setStrokeStyle(2, 0x7f8c8d);
        let txtS = this.add.text(0, -40, 'СМЕНИТЬ НИК', { fontSize: '18px' }).setOrigin(0.5);
        
        let btnH = this.add.rectangle(0, 40, 240, 50, 0x34495e).setInteractive().setStrokeStyle(2, 0x7f8c8d);
        let txtH = this.add.text(0, 40, 'ИСТОРИЯ БОЁВ', { fontSize: '18px' }).setOrigin(0.5);
        
        settingsModal.add([overlay, modalBg, titleS, btnS, txtS, btnH, txtH]);
        
        // Исправленный клик - останавливаем "пробивание" вниз
        settingsBtn.on('pointerdown', (p, x, y, event) => {
            event.stopPropagation(); 
            settingsModal.setVisible(true);
        });

        // Смена ника с лимитом
        btnS.on('pointerdown', (p, x, y, event) => {
            event.stopPropagation();
            if (myNickChanges >= 1) {
                alert("Ты уже менял ник бесплатно! В будущем здесь будет смена за гемы 💎");
                return;
            }
            
            showLoginModal(true, async (n, psw, modalNode) => {
                const newUserRef = ref(db, `users/${n}`);
                const snap = await get(newUserRef);
                if (snap.exists()) { alert("Этот ник уже занят!"); return; }
                
                myNickChanges++;
                await set(newUserRef, { password: psw, trophies: myTrophies, botTrophies: myBotTrophies, history: battleHistory, nickChanges: myNickChanges });
                if (myNickname) await remove(ref(db, `users/${myNickname}`));
                
                myNickname = n; myPassword = psw;
                localStorage.setItem('bbr_nick', myNickname);
                localStorage.setItem('bbr_pass', myPassword);
                localStorage.setItem('bbr_nick_changes', myNickChanges);
                
                if (self.nickText) self.nickText.setText(`👤 ${myNickname}`);
                alert("Ник и пароль успешно изменены!");
                modalNode.remove();
                settingsModal.setVisible(false);
            });
        });
              // Вспомогательная функция для уведомлений (чтобы не дублировать)
        let isSearching = false;
        let showWarn = (msg) => {
            let bg = self.add.rectangle(200, 350, 300, 40, 0x000000, 0.7).setDepth(199);
            let w = self.add.text(200, 350, msg, {fontSize: '18px', fill: '#fff', fontStyle: 'bold'}).setOrigin(0.5).setDepth(200);
            self.tweens.add({targets: [w, bg], alpha: 0, y: 300, duration: 2500, onComplete: () => {w.destroy(); bg.destroy();} });
        };

        // --- 5. ОКНО ИСТОРИИ И ТЕКУЩИХ БОЕВ ---
        let historyModal = this.add.container(200, 400).setDepth(2000).setVisible(false);
        let hOverlay = this.add.rectangle(0, 0, 400, 800, 0x000000, 0.7).setInteractive();
        hOverlay.on('pointerdown', (p, x, y, event) => { event.stopPropagation(); historyModal.setVisible(false); });
        
        let hBg = this.add.rectangle(0, 0, 360, 650, 0x1e2a38).setStrokeStyle(3, 0x7f8c8d);
        let tabH = this.add.rectangle(-90, -290, 180, 40, 0x34495e).setInteractive();
        let txtTabH = this.add.text(-90, -290, 'ИСТОРИЯ', { fontSize: '16px' }).setOrigin(0.5);
        let tabC = this.add.rectangle(90, -290, 180, 40, 0x2c3e50).setInteractive();
        let txtTabC = this.add.text(90, -290, 'ТЕКУЩИЕ', { fontSize: '16px' }).setOrigin(0.5);
        
        let contentList = this.add.container(0, 0);
        historyModal.add([hOverlay, hBg, tabH, txtTabH, tabC, txtTabC, contentList]);

        btnH.on('pointerdown', (p, x, y, event) => { 
            event.stopPropagation(); 
            settingsModal.setVisible(false); 
            historyModal.setVisible(true); 
            renderHistory(); 
        });

        let renderHistory = () => {
            contentList.removeAll(true);
            tabH.setFillStyle(0x34495e); tabC.setFillStyle(0x2c3e50);
            if (battleHistory.length === 0) {
                contentList.add(self.add.text(0, 0, 'Боёв пока нет...', { fontSize: '16px', fill: '#7f8c8d' }).setOrigin(0.5));
            } else {
                battleHistory.slice().reverse().forEach((h, i) => { 
                    let card = self.add.container(0, -200 + i*90);
                    card.add(self.add.rectangle(0, 0, 320, 80, 0x2c3e50));
                    card.add(self.add.text(-140, -20, h.res, { fontSize: '18px', color: h.res==='ПОБЕДА'?'#2ecc71':'#e74c3c', fontStyle: 'bold' }));
                    card.add(self.add.text(-140, 10, h.date, { fontSize: '12px', fill: '#bdc3c7' }));
                    card.add(self.add.text(140, -10, 'VS\n' + h.vs, { fontSize: '14px', align: 'right' }).setOrigin(1, 0.5));
                    contentList.add(card);
                });
            }
        };

        let renderCurrent = async () => {
            contentList.removeAll(true);
            tabC.setFillStyle(0x34495e); tabH.setFillStyle(0x2c3e50);
            contentList.add(self.add.text(0, 0, 'ЗАГРУЗКА...', { fontSize: '14px' }).setOrigin(0.5));
            
            const snap = await get(activeMatchesRef);
            contentList.removeAll(true);
            let matches = snap.val();
            if (!matches) {
                contentList.add(self.add.text(0, 0, 'Нет активных боёв', { fontSize: '16px', fill: '#7f8c8d' }).setOrigin(0.5));
            } else {
                let yPos = 0;
                Object.keys(matches).forEach((key) => {
                    let m = matches[key];
                    let card = self.add.container(0, -200 + yPos*90);
                    card.add(self.add.rectangle(0, 0, 320, 80, 0x34495e));
                    card.add(self.add.text(0, -20, `${m.p1} vs ${m.p2}`, { fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5));
                    let watchBtn = self.add.rectangle(0, 15, 120, 30, 0x27ae60).setInteractive();
                    card.add([watchBtn, self.add.text(0, 15, '👁️ СМОТРЕТЬ', { fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5)]);
                    
                    watchBtn.on('pointerdown', () => {
                        isSpectator = true; playerRole = 'enemy'; isHost = false;
                        gamePath = key; rebindFirebaseRefs();
                        self.scene.start('GameScene');
                    });
                    contentList.add(card);
                    yPos++;
                });
            }
        };

        tabH.on('pointerdown', renderHistory);
        tabC.on('pointerdown', renderCurrent);

        // --- 6. ЛОГИКА СТАРТА МАТЧА ---
        let startMatch = async (isBot) => {
            if (!myNickname) { 
                alert("Сначала создай аккаунт!"); 
                authenticateUser(); 
                return; 
            }
            if (isSearching) return;
            if (window.userDeck.filter(c => c !== null).length < 8) { showWarn('Не хватает карт в колоде!'); return; }
            
            isSearching = true; isBotMode = isBot; isSpectator = false;
            if(isBot) { btnBot.setFillStyle(0x8e44ad); txtBot.setText('ЗАГРУЗКА'); }
            else { btnBattle.setFillStyle(0xc0392b); txtBattle.setText('ПОИСК...'); }
            
            if (isBot) {
                gamePath = `match_bot_${playerId}`;
                rebindFirebaseRefs();
                playerRole = 'me'; isHost = true;
                set(stateRef, { startTime: Date.now(), phase: '1x', isOvertime: false, tiebreakerStarted: false, overtimeDecided: false });
                onDisconnect(ref(db, gamePath)).remove(); 
                self.scene.start('GameScene');
            } else {
                gamePath = "match_v106_final";
                rebindFirebaseRefs();
                const snap = await get(ref(db, `${gamePath}/players`));
                playerRole = ((snap.val() || {})['me']) ? 'enemy' : 'me'; 
                isHost = (playerRole === 'me');
                
                if (isHost) {
                    await clearMatchData();
                    // Публикуем матч для зрителей
                    await set(ref(db, `active_matches/${gamePath}`), { p1: myNickname, p2: '???', start: Date.now() });
                    onDisconnect(ref(db, `active_matches/${gamePath}`)).remove();
                } else {
                    await dbUpdate(ref(db, `active_matches/${gamePath}`), { p2: myNickname });
                }
                
                let myRef = ref(db, `${gamePath}/players/${playerRole}`);
                set(myRef, { ready: true, nick: myNickname }); 
                onDisconnect(myRef).remove();
                
                onValue(ref(db, `${gamePath}/players`), (s) => {
                    let p = s.val() || {}; 
                    if (p['me'] && p['me'].ready && p['enemy'] && p['enemy'].ready) {
                        if (isHost) set(stateRef, { startTime: Date.now(), phase: '1x', isOvertime: false, tiebreakerStarted: false, overtimeDecided: false });
                        self.scene.start('GameScene');
                    }
                });
            }
        };

        btnBattle.on('pointerdown', () => startMatch(false));
        btnBot.on('pointerdown', () => startMatch(true));
              // --- 7. МЕНЕДЖЕР КОЛОДЫ (КЛАССИЧЕСКИЕ ТЕКСТОВЫЕ КАРТЫ) ---
        let renderDeck = () => {
            deckTab.removeAll(true);
            deckTab.add(this.add.rectangle(200, 400, 400, 800, 0x000000, 0.4));
            
            let topBar = this.add.container(0,0);
            let actionMenu = this.add.container(60, 80).setVisible(false).setDepth(300);
            actionMenu.add(this.add.rectangle(0, 0, 120, 100, 0x34495e).setStrokeStyle(2, 0xffffff));
            let bCopy = this.add.text(0, -30, 'Копировать', {fontSize:'14px', fill:'#fff'}).setInteractive().setOrigin(0.5);
            let bPaste = this.add.text(0, 0, 'Вставить', {fontSize:'14px', fill: copiedDeck?'#2ecc71':'#7f8c8d'}).setInteractive().setOrigin(0.5);
            let bClear = this.add.text(0, 30, 'Очистить', {fontSize:'14px', fill:'#e74c3c'}).setInteractive().setOrigin(0.5);
            actionMenu.add([bCopy, bPaste, bClear]);
            
            bCopy.on('pointerdown', () => { copiedDeck = [...window.userDeck]; localStorage.setItem('bbr_copied', JSON.stringify(copiedDeck)); actionMenu.setVisible(false); renderDeck(); });
            bPaste.on('pointerdown', () => { if(copiedDeck) { window.userDeck = [...copiedDeck]; saveDecksData(); actionMenu.setVisible(false); renderDeck(); } });
            bClear.on('pointerdown', () => { window.userDeck = [null,null,null,null,null,null,null,null]; saveDecksData(); actionMenu.setVisible(false); renderDeck(); });

            let burger = this.add.rectangle(30, 30, 40, 30, 0x2c3e50).setInteractive();
            topBar.add([burger, this.add.text(30, 30, '≡', {fontSize:'24px', fill:'#fff'}).setOrigin(0.5)]);
            burger.on('pointerdown', () => actionMenu.setVisible(!actionMenu.visible));

            for(let i=0; i<4; i++) {
                let isAct = (i === activeDeckIdx);
                let btn = this.add.rectangle(90 + i*50, 30, 40, 30, isAct ? 0xf1c40f : 0x34495e).setInteractive();
                topBar.add([btn, this.add.text(90 + i*50, 30, (i+1).toString(), {fontSize:'18px', fill: isAct?'#000':'#fff', fontStyle:'bold'}).setOrigin(0.5)]);
                btn.on('pointerdown', () => { activeDeckIdx = i; window.userDeck = savedDecks[i]; saveDecksData(); renderDeck(); });
            }
            deckTab.add([topBar, actionMenu]);

            deckTab.add(this.add.text(200, 80, 'АКТИВНАЯ КОЛОДА', { fontSize: '18px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
            deckTab.add(this.add.text(200, 100, '(Дабл-тап для добавления/удаления)', { fontSize: '12px', fill: '#bdc3c7' }).setOrigin(0.5));
            
            // Слоты активной колоды
            for(let i=0; i<8; i++) {
                let cx = 65 + (i%4)*90; let cy = 160 + Math.floor(i/4)*95;
                let slot = this.add.rectangle(cx, cy, 80, 80, 0x000, 0.5).setStrokeStyle(2, 0x7f8c8d).setInteractive();
                deckTab.add(slot);
                if (window.userDeck[i]) {
                    let c = window.allCardsData.find(cd => cd.id === window.userDeck[i]);
                    let cName = cardNames[c.id] || c.id.toUpperCase();
                    
                    slot.setFillStyle(c.color, 1);
                    deckTab.add(this.add.text(cx, cy - 10, cName, {fontSize:'11px', fill:'#fff', fontStyle:'bold', align:'center', wordWrap:{width:75}}).setOrigin(0.5));
                    deckTab.add(this.add.text(cx, cy + 20, "💧 " + c.c, {fontSize:'14px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5));
                    
                    slot.on('pointerdown', () => { let n = Date.now(); if(n - (slot.lc||0) < 300) { window.userDeck[i] = null; saveDecksData(); renderDeck(); } slot.lc = n; });
                } else {
                    deckTab.add(this.add.text(cx, cy, '+', { fontSize: '24px', fill: '#7f8c8d' }).setOrigin(0.5));
                }
            }

            // Список всех карт
            window.allCardsData.forEach((c, i) => {
                let cx = 55 + (i%5)*72; let cy = 420 + Math.floor(i/5)*95;
                let btn = this.add.rectangle(cx, cy, 65, 80, c.color).setInteractive();
                let cName = cardNames[c.id] || c.id.toUpperCase();
                
                deckTab.add(btn);
                deckTab.add(this.add.text(cx, cy - 10, cName, {fontSize:'9px', fill:'#fff', fontStyle:'bold', align:'center', wordWrap:{width:60}}).setOrigin(0.5));
                deckTab.add(this.add.text(cx, cy + 20, "💧 " + c.c, {fontSize:'12px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5));
                
                if (window.userDeck.includes(c.id)) deckTab.add(this.add.rectangle(cx, cy, 65, 80, 0x000, 0.7));
                btn.on('pointerdown', () => { let n = Date.now(); if(n - (btn.lc||0) < 300 && !window.userDeck.includes(c.id)) { 
                    let e = window.userDeck.indexOf(null); if(e!==-1) { window.userDeck[e] = c.id; saveDecksData(); renderDeck(); }
                } btn.lc = n; });
            });
        };

        // --- 8. НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ ---
        this.add.rectangle(200, 750, 400, 100, 0x111922);
        let navDeck = this.add.rectangle(100, 750, 190, 80, 0x1E2A38).setInteractive();
        let navBattle = this.add.rectangle(300, 750, 190, 80, 0x2C3E50).setInteractive();
        this.add.text(100, 750, '🃏 КОЛОДА', { fontSize: '20px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(300, 750, '⚔️ БОЙ', { fontSize: '20px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        navBattle.on('pointerdown', () => { battleTab.setVisible(true); deckTab.setVisible(false); navBattle.setFillStyle(0x2C3E50); navDeck.setFillStyle(0x1E2A38); });
        navDeck.on('pointerdown', () => { battleTab.setVisible(false); deckTab.setVisible(true); navDeck.setFillStyle(0x2C3E50); navBattle.setFillStyle(0x1E2A38); renderDeck(); });
    }
}; // <-- ЗАКРЫВАЕТ ОБЪЕКТ MenuScene
const GameScene = {
    key: 'GameScene',
    create: function() {
        let self = this;
        
        // --- 1. СБРОС ИГРОВЫХ ПЕРЕМЕННЫХ ПЕРЕД МАТЧЕМ ---
        elixir = 5; 
        selectedCardObj = null; 
        isGameOver = false; 
        lastLogic = 0;
        
        unitsMap = {}; 
        towerGroup = this.add.group(); 
        projectiles = this.add.group(); 
        hpBarsGroup = this.add.group();
        
        // --- 2. НАСТРОЙКА РЕЖИМОВ (БОТ, ЗРИТЕЛЬ, ОНЛАЙН) ---
        if (isSpectator) {
            let exitBg = this.add.rectangle(30, 30, 40, 40, 0xff0000, 0.5).setInteractive().setDepth(200);
            this.add.text(30, 30, '❌', {fontSize: '20px'}).setOrigin(0.5).setDepth(201);
            exitBg.on('pointerdown', () => { self.scene.start('MenuScene'); });
            roleText = this.add.text(60, 20, "НАБЛЮДЕНИЕ 👁️", {fontSize:'14px', fill:'#fff', fontStyle:'bold'}).setDepth(101);
        } else if (isBotMode) {
            self.botElixir = 5;
            let shuffledAll = [...window.allCardsData].sort(() => Math.random() - 0.5);
            let bDeck = shuffledAll.slice(0, 8).map(c => c.id);
            self.botHand = bDeck.slice(0, 4);
            self.botNext = bDeck.slice(4, 8);
            self.botLastAction = 0; 
            
            let exitBg = this.add.rectangle(30, 30, 40, 40, 0xff0000, 0.5).setInteractive().setDepth(200);
            this.add.text(30, 30, '❌', {fontSize: '20px'}).setOrigin(0.5).setDepth(201);
            exitBg.on('pointerdown', () => {
                isGameOver = true;
                clearMatchData().then(() => { self.scene.start('MenuScene'); });
            });
            roleText = this.add.text(60, 20, "БОТ (ТРЕНИРОВКА) 🤖", {fontSize:'14px', fill:'#fff', fontStyle:'bold'}).setDepth(101);
        } else {
            roleText = this.add.text(10, 10, isHost ? "СИНИЕ (HOST)" : "КРАСНЫЕ (CLIENT)", {fontSize:'14px', fill:'#fff', fontStyle:'bold'}).setDepth(101);
        }

        onValue(stateRef, snap => { 
            if(snap.val()) gameState = snap.val(); 
        });

        // --- 3. ПОДГОТОВКА КОЛОДЫ ИГРОКА ---
        let shuffledDeck = [...window.userDeck].sort(() => Math.random() - 0.5);
        self.handIds = shuffledDeck.slice(0, 4); 
        self.nextIds = shuffledDeck.slice(4, 8);
        self.uiElements = [];
        
        timerText = this.add.text(200, 25, '3:00', {fontSize:'28px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5).setDepth(101);
        phaseText = this.add.text(200, 50, '', {fontSize:'14px', fill:'#f1c40f', fontStyle:'bold'}).setOrigin(0.5).setDepth(101);

        // --- 4. ОТРИСОВКА АРЕНЫ И БАШЕН ---
        setupTowers(self); 
        
        for (let y = 0; y < 600; y += 25) {
            for (let x = 0; x < 400; x += 25) { 
                let color = ((x+y)/25) % 2 === 0 ? 0x638a4d : 0x739a5d;
                this.add.rectangle(x + 12.5, y + 12.5, 25, 25, color); 
            }
        }
        
        this.add.rectangle(200, 300, 400, 40, 0x3498db).setDepth(1); 
        this.add.rectangle(100, 300, 50, 60, 0x7d6752).setDepth(2); 
        this.add.rectangle(300, 300, 50, 60, 0x7d6752).setDepth(2); 
        
        for(let i = 0; i < 4; i++) {
            this.add.rectangle(100, 277 + i*15, 50, 2, 0x4a3c31).setDepth(3); 
            this.add.rectangle(300, 277 + i*15, 50, 2, 0x4a3c31).setDepth(3);
        }
        
        this.add.rectangle(200, 700, 400, 200, 0x1E2A38).setDepth(100);
        
        // --- 5. НОВАЯ ПОЛОСКА ЭЛИКСИРА ---
        elixirBar = self.add.container(200, 630).setDepth(101);
        elixirBar.add(self.add.rectangle(0, 0, 300, 20, 0x34495e).setStrokeStyle(2, 0xffffff));
        for(let i=1; i<10; i++) {
            elixirBar.add(self.add.rectangle(-150 + i*30, 0, 2, 20, 0x000000, 0.4)); // Деления
        }
        elixirFill = self.add.rectangle(-150, 0, 0, 20, 0x3498db).setOrigin(0, 0.5);
        elixirBar.add(elixirFill);
        elixirText = self.add.text(0, 25, '💧 5', { fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5);
        elixirBar.add(elixirText);
        
        // --- 6. ЭМОДЗИ И ЧАТ ---
        let emoteBtn = self.add.circle(30, 400, 20, 0x34495e).setInteractive().setDepth(101);
        self.add.text(30, 400, '💬', {fontSize:'20px'}).setOrigin(0.5).setDepth(102);
        
        let emotePanel = self.add.container(200, 400).setDepth(150).setVisible(false);
        emotePanel.add(self.add.rectangle(0, 0, 300, 220, 0x000000, 0.9).setStrokeStyle(2, 0xffffff));
        let closeBtn = self.add.text(130, -95, 'X', {fontSize:'20px', fill:'#e74c3c'}).setInteractive();
        closeBtn.on('pointerdown', () => emotePanel.setVisible(false));
        emotePanel.add(closeBtn);
        
        emoteBtn.on('pointerdown', () => emotePanel.setVisible(!emotePanel.visible));
        
        let emotes = ['👍', '😂', '😭', '😠'];
        emotes.forEach((e, i) => {
            let b = self.add.rectangle(-90 + i*60, -50, 50, 50, 0xffffff, 0.1).setInteractive();
            b.on('pointerdown', () => { 
                push(eventsRef, {type:'chat', side:playerRole, msg:e}); 
                emotePanel.setVisible(false); 
            });
            emotePanel.add([b, self.add.text(-90 + i*60, -50, e, {fontSize:'25px'}).setOrigin(0.5)]);
        });
        
        let phrases = ["Удачи!", "Хорошая игра!", "Да пошел ты рахуй пидор блять", "Спасибо!", "Шо ти хлопче", "Сосать русский пидорас"];
        phrases.forEach((p, i) => {
            let px = (i % 2 === 0) ? -70 : 70; 
            let py = 10 + Math.floor(i / 2) * 35;
            let b = self.add.rectangle(px, py, 130, 28, 0x34495e).setInteractive();
            b.on('pointerdown', () => { 
                push(eventsRef, {type:'chat', side:playerRole, msg:p}); 
                emotePanel.setVisible(false); 
            });
            emotePanel.add([b, self.add.text(px, py, p, {fontSize:'12px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5)]);
        });
              // --- 7. ОТРИСОВКА КАРТ В РУКЕ (КЛАССИЧЕСКИЕ ТЕКСТОВЫЕ КАРТЫ) ---
        self.renderHand = () => {
            self.uiElements.forEach(e => e.destroy()); 
            self.uiElements = [];
            
            self.handIds.forEach((id, i) => {
                let cData = window.allCardsData.find(c => c.id === id);
                let cName = cardNames[cData.id] || cData.id.toUpperCase();
                let btn = self.add.rectangle(100 + i*90, 720, 80, 90, cData.color).setInteractive().setDepth(101);
                
                let txtName = self.add.text(100 + i*90, 695, cName, {fontSize:'11px', fill:'#fff', fontStyle:'bold', align:'center', wordWrap:{width:75}}).setOrigin(0.5).setDepth(102);
                let txt2 = self.add.text(100 + i*90, 740, "💧 " + cData.c, {fontSize:'16px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5).setDepth(102);
                
                btn.on('pointerdown', () => { 
                    if (gameState.tiebreakerStarted || isSpectator) return; 
                    selectedCardObj = { data: cData, index: i }; 
                    self.uiElements.forEach(e => { 
                        if(e.type === 'Rectangle' && e.depth === 101) e.setStrokeStyle(0); 
                    }); 
                    btn.setStrokeStyle(4, 0xf1c40f); 
                });
                self.uiElements.push(btn, txtName, txt2);
            });
            
            let nextData = window.allCardsData.find(c => c.id === self.nextIds[0]);
            let nextName = cardNames[nextData.id] || nextData.id.toUpperCase();
            let nextBtn = self.add.rectangle(30, 720, 40, 50, nextData.color).setDepth(101);
            let nextTxtName = self.add.text(30, 710, nextName, {fontSize:'7px', fill:'#fff', fontStyle:'bold', align:'center', wordWrap:{width:38}}).setOrigin(0.5).setDepth(102);
            let nextTxt = self.add.text(30, 735, "💧" + nextData.c, {fontSize:'10px', fill:'#fff', align:'center', fontStyle:'bold'}).setOrigin(0.5).setDepth(102);
            
            self.uiElements.push(nextBtn, nextTxtName, nextTxt);
        };
        self.renderHand();
        
        // --- 8. КЛИК ПО АРЕНЕ (ВЫСАДКА) ---
        this.input.on('pointerdown', (p) => {
            // Защита: Зрители и мертвецы не ставят карты
            if (isSpectator || !selectedCardObj || p.y > 600 || !playerRole || isGameOver || gameState.tiebreakerStarted) return;
            
            let cData = selectedCardObj.data; 
            if (cData.id !== 'fireball' && cData.id !== 'arrows' && cData.id !== 'log' && cData.id !== 'goblinbarrel' && cData.id !== 'rocket' && p.y < 350) return; 
            
            if (elixir >= cData.c) {
                elixir -= cData.c; 
                let tx = isHost ? p.x : 400 - p.x; 
                let ty = isHost ? p.y : 600 - p.y; 
                let spread = 35; 
                
                if (cData.id === 'archers') { 
                    push(unitsRef, {x: tx - spread, y: ty, type: 'archer', owner: playerRole, lane: (tx - spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx + spread, y: ty, type: 'archer', owner: playerRole, lane: (tx + spread < 200 ? 'left' : 'right')}); 
                }
                else if (cData.id === 'goblins') { 
                    push(unitsRef, {x: tx - spread, y: ty - 15, type: 'goblin', owner: playerRole, lane: (tx - spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx + spread, y: ty - 15, type: 'goblin', owner: playerRole, lane: (tx + spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx, y: ty + 15, type: 'goblin', owner: playerRole, lane: (tx < 200 ? 'left' : 'right')}); 
                }
                else if (cData.id === 'speargoblins') { 
                    push(unitsRef, {x: tx - spread, y: ty - 15, type: 'speargoblin', owner: playerRole, lane: (tx - spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx + spread, y: ty - 15, type: 'speargoblin', owner: playerRole, lane: (tx + spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx, y: ty + 15, type: 'speargoblin', owner: playerRole, lane: (tx < 200 ? 'left' : 'right')}); 
                }
                else if (cData.id === 'goblingang') { 
                    let sp = 25; 
                    push(unitsRef, {x: tx - sp, y: ty - 10, type: 'goblin', owner: playerRole, lane: (tx - sp < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx + sp, y: ty - 10, type: 'goblin', owner: playerRole, lane: (tx + sp < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx, y: ty - 20, type: 'goblin', owner: playerRole, lane: (tx < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx - sp, y: ty + 15, type: 'speargoblin', owner: playerRole, lane: (tx - sp < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx + sp, y: ty + 15, type: 'speargoblin', owner: playerRole, lane: (tx + sp < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx, y: ty + 25, type: 'speargoblin', owner: playerRole, lane: (tx < 200 ? 'left' : 'right')}); 
                }
                else if (cData.id === 'minions') { 
                    push(unitsRef, {x: tx - spread, y: ty - 15, type: 'minion', owner: playerRole, lane: (tx - spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx + spread, y: ty - 15, type: 'minion', owner: playerRole, lane: (tx + spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx, y: ty + 15, type: 'minion', owner: playerRole, lane: (tx < 200 ? 'left' : 'right')}); 
                }
                else if (cData.id === 'skeletons') { 
                    for(let k = 0; k < 4; k++) { 
                        let sx = tx + (k % 2 === 0 ? -spread : spread); 
                        let sy = ty + (k < 2 ? -15 : 15); 
                        push(unitsRef, {x: sx, y: sy, type: 'skeleton', owner: playerRole, lane: (sx < 200 ? 'left' : 'right')}); 
                    } 
                }
                else {
                    push(unitsRef, {x: tx, y: ty, type: cData.id, owner: playerRole, lane: (tx < 200 ? 'left' : 'right')});
                }
                
                let playedId = self.handIds[selectedCardObj.index]; 
                self.handIds[selectedCardObj.index] = self.nextIds.shift(); 
                self.nextIds.push(playedId);
                
                selectedCardObj = null; 
                self.renderHand();
            }
        });
        
        // --- 9. СЛУШАТЕЛИ FIREBASE (ЮНИТЫ И БАШНИ) ---
        onChildAdded(unitsRef, (snapshot) => { 
            handleSpawn(self, snapshot.val(), snapshot.key); 
        });
        
        onChildRemoved(unitsRef, (snapshot) => { 
            if (unitsMap[snapshot.key]) destroyUnit(snapshot.key); 
        });
        
        onChildChanged(unitsRef, (snapshot) => {
            let id = snapshot.key; 
            let data = snapshot.val();
            if (unitsMap[id] && !isHost && data.hp !== undefined) { 
                unitsMap[id].setData('hp', data.hp); 
                if(data.hp <= 0) destroyUnit(id); 
            }
        });
        
        if (!isHost) {
            onValue(towersRef, (snapshot) => {
                const data = snapshot.val(); 
                if (data) {
                    towerGroup.children.entries.forEach(t => {
                        let tid = t.getData('id'); 
                        if (data[tid] && data[tid].hp !== undefined) {
                            let hp = data[tid].hp; 
                            t.setData('hp', hp);
                            if(t.getData('bar')) {
                                t.getData('bar').width = (hp / t.getData('maxHp')) * (t.getData('isM') ? 60 : 40);
                            }
                            if (hp <= 0 && t.active) destroyTower(self, t);
                            
                            if (t.getData('isM') && !t.getData('isA') && hp < t.getData('maxHp')) {
                                t.setData('isA', true); 
                                if(t.getData('weapon')) t.getData('weapon').setVisible(true);
                            }
                        }
                    });
                }
            });
        }
        
        // --- 10. СЛУШАТЕЛЬ FIREBASE (СОБЫТИЯ) ---
        onChildAdded(eventsRef, (snapshot) => { 
            let ev = snapshot.val(); 
            
            if(ev.type === 'spell_boom') doSpellBoom(self, ev.x, ev.y, ev.owner, ev.spellId);
            if(ev.type === 'logRoll') doLogRoll(self, ev.x, ev.y, ev.owner, snapshot.key);
            
            if(ev.type === 'barrel_drop') {
                if (isHost) {
                    let tx = ev.x, ty = ev.y; let spread = 25;
                    push(unitsRef, {x: tx - spread, y: ty - 10, type: 'goblin', owner: ev.owner, lane: (tx - spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx + spread, y: ty - 10, type: 'goblin', owner: ev.owner, lane: (tx + spread < 200 ? 'left' : 'right')}); 
                    push(unitsRef, {x: tx, y: ty + 15, type: 'goblin', owner: ev.owner, lane: (tx < 200 ? 'left' : 'right')});
                }
            }
            if(ev.type === 'freeze_boom') {
                doFreezeBoom(self, ev.x, ev.y, ev.owner);
                if (isHost) remove(ref(db, `${gamePath}/events/${snapshot.key}`)); 
            }
            if(ev.type === 'chat') {
                // Если мы зритель, видим всё от лица "enemy" и "me"
                let isMeChat = ev.side === playerRole;
                let bubble = self.add.container(isMeChat ? 270 : 130, isMeChat ? 480 : 120).setDepth(200);
                bubble.add(self.add.rectangle(0, 0, 140, 40, 0xffffff).setStrokeStyle(2, 0x000));
                bubble.add(self.add.text(0, 0, ev.msg, {fontSize: ev.msg.length > 2 ? '12px' : '25px', fill: '#000', align: 'center', wordWrap: {width: 130}}).setOrigin(0.5));
                self.time.delayedCall(2500, () => bubble.destroy());
            }
        });
    }, // <-- КОНЕЦ МЕТОДА CREATE
          update: function(time, delta) {
        let self = this;
        
        if (isGameOver || !playerRole || !gameState.startTime) return; 
        
        let elapsed = (Date.now() - gameState.startTime) / 1000;
        let remaining = 180 - elapsed; 
        let mult = 1;

        // --- 1. ТАЙМЕРЫ И ФАЗЫ ИГРЫ ---
        if (elapsed < 120) { 
            phaseText.setText(''); 
        } else if (elapsed >= 120 && elapsed < 180) { 
            phaseText.setText('x2 ELIXIR'); 
            mult = 2; 
        } else if (elapsed >= 180) {
            if (isHost && !gameState.overtimeDecided) {
                let meT = 0, enT = 0;
                towerGroup.children.entries.forEach(t => { 
                    if(t.active) { if(t.getData('side') === 'me') meT++; else enT++; } 
                });
                if (meT === enT) dbUpdate(stateRef, { overtimeDecided: true, isOvertime: true });
                else dbUpdate(stateRef, { overtimeDecided: true, isOvertime: false, endWinner: meT > enT ? 'me' : 'enemy' });
            }
            if (gameState.overtimeDecided) {
                if (!gameState.isOvertime) {
                    isGameOver = true; 
                    let iWon = (gameState.endWinner === playerRole);
                    this.add.text(60, 300, iWon ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ!', {fontSize:'45px', fill: iWon ? '#f1c40f' : '#e74c3c', fontStyle:'bold'}).setDepth(200); 
                    
                    if (!isSpectator && !self.trophyAwarded) {
                        self.trophyAwarded = true; 
                        if (isBotMode && iWon) myBotTrophies++; 
                        else if (!isBotMode && iWon) myTrophies++; 
                        
                        let res = iWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
                        battleHistory.push({ res: res, date: new Date().toLocaleTimeString(), vs: isBotMode ? 'Бот' : 'Онлайн Игрок' });
                        if (battleHistory.length > 10) battleHistory.shift();
                        
                        if (myNickname) dbUpdate(ref(db, `users/${myNickname}`), { trophies: myTrophies, botTrophies: myBotTrophies, history: battleHistory });
                        localStorage.setItem('bbr_history', JSON.stringify(battleHistory));
                        localStorage.setItem('bbr_trophies', myTrophies);
                        localStorage.setItem('bbr_bot_trophies', myBotTrophies);
                    }
                    return;
                }
                remaining = 240 - elapsed;
                if (remaining > 0) { phaseText.setText('BONUS TIME!\nx3 ELIXIR'); mult = 3; } 
                else {
                    remaining = 0; phaseText.setText('TIEBREAKER!\nSUDDEN DEATH'); mult = 0;
                    if (isHost && !gameState.tiebreakerStarted) dbUpdate(stateRef, { tiebreakerStarted: true });
                }
            }
        }
        
        let disp = Math.max(0, Math.floor(remaining));
        timerText.setText(Math.floor(disp/60) + ':' + (disp%60 < 10 ? '0' : '') + disp%60);
        
        // --- 2. НАЧИСЛЕНИЕ ЭЛИКСИРА (ШКАЛА И ТЕКСТ) ---
        if (!gameState.tiebreakerStarted && elixir < 10 && !isSpectator) {
            elixir += 0.35 * mult * (delta / 1000);
            if (elixir > 10) elixir = 10;
            
            // Анимация новой шкалы
            if (elixirFill) elixirFill.width = (elixir / 10) * 300;
            if (elixirText) elixirText.setText('💧 ' + Math.floor(elixir));
        } else if (isSpectator) {
            if (elixirBar) elixirBar.setVisible(false); // Прячем эликсир у зрителя
        }

        // --- 3. ИИ БОТА (СИНХРОННЫЙ С DELTA) ---
        if (isBotMode && !gameState.tiebreakerStarted && !isGameOver && isHost) {
            if (self.botElixir < 10) {
                self.botElixir += 0.35 * mult * (delta / 1000);
                if (self.botElixir > 10) self.botElixir = 10;
            }
            if (time > self.botLastAction) {
                let rIndex = Math.floor(Math.random() * self.botHand.length);
                let cardId = self.botHand[rIndex];
                let cData = window.allCardsData.find(c => c.id === cardId);
                
                if (self.botElixir >= cData.c) {
                    self.botElixir -= cData.c;
                    self.botLastAction = time + (Math.random() * 2000 + 1500); 
                    
                    let baseLaneX = Math.random() > 0.5 ? 100 : 300; 
                    let tx = baseLaneX + (Math.random() * 60 - 30);
                    let isSpellOrBarrel = (cData.id === 'fireball' || cData.id === 'arrows' || cData.id === 'goblinbarrel' || cData.id === 'rocket');
                    let ty = isSpellOrBarrel ? (450 + Math.random() * 100) : (60 + Math.random() * 200); 
                    let spread = 35;
                    
                    if (cData.id === 'archers') { push(unitsRef, {x:tx-spread, y:ty, type:'archer', owner:'enemy', lane:(tx-spread<200?'left':'right')}); push(unitsRef, {x:tx+spread, y:ty, type:'archer', owner:'enemy', lane:(tx+spread<200?'left':'right')}); }
                    else if (cData.id === 'goblins') { push(unitsRef, {x:tx-spread, y:ty-15, type:'goblin', owner:'enemy', lane:(tx-spread<200?'left':'right')}); push(unitsRef, {x:tx+spread, y:ty-15, type:'goblin', owner:'enemy', lane:(tx+spread<200?'left':'right')}); push(unitsRef, {x:tx, y:ty+15, type:'goblin', owner:'enemy', lane:(tx<200?'left':'right')}); }
                    else if (cData.id === 'speargoblins') { push(unitsRef, {x:tx-spread, y:ty-15, type:'speargoblin', owner:'enemy', lane:(tx-spread<200?'left':'right')}); push(unitsRef, {x:tx+spread, y:ty-15, type:'speargoblin', owner:'enemy', lane:(tx+spread<200?'left':'right')}); push(unitsRef, {x:tx, y:ty+15, type:'speargoblin', owner:'enemy', lane:(tx<200?'left':'right')}); }
                    else if (cData.id === 'goblingang') { 
                        let sp = 25; 
                        push(unitsRef, {x:tx-sp, y:ty-10, type:'goblin', owner:'enemy', lane:(tx-sp<200?'left':'right')}); push(unitsRef, {x:tx+sp, y:ty-10, type:'goblin', owner:'enemy', lane:(tx+sp<200?'left':'right')}); push(unitsRef, {x:tx, y:ty-20, type:'goblin', owner:'enemy', lane:(tx<200?'left':'right')}); 
                        push(unitsRef, {x:tx-sp, y:ty+15, type:'speargoblin', owner:'enemy', lane:(tx-sp<200?'left':'right')}); push(unitsRef, {x:tx+sp, y:ty+15, type:'speargoblin', owner:'enemy', lane:(tx+sp<200?'left':'right')}); push(unitsRef, {x:tx, y:ty+25, type:'speargoblin', owner:'enemy', lane:(tx<200?'left':'right')}); 
                    }
                    else if (cData.id === 'minions') { push(unitsRef, {x:tx-spread, y:ty-15, type:'minion', owner:'enemy', lane:(tx-spread<200?'left':'right')}); push(unitsRef, {x:tx+spread, y:ty-15, type:'minion', owner:'enemy', lane:(tx+spread<200?'left':'right')}); push(unitsRef, {x:tx, y:ty+15, type:'minion', owner:'enemy', lane:(tx<200?'left':'right')}); }
                    else if (cData.id === 'skeletons') { for(let k=0; k<4; k++) { let sx = tx+(k%2===0?-spread:spread); let sy=ty+(k<2?-15:15); push(unitsRef, {x:sx, y:sy, type:'skeleton', owner:'enemy', lane:(sx<200?'left':'right')}); } }
                    else push(unitsRef, {x:tx, y:ty, type:cData.id, owner:'enemy', lane:(tx<200?'left':'right')});
                    
                    let playedId = self.botHand[rIndex]; 
                    self.botHand[rIndex] = self.botNext.shift(); 
                    self.botNext.push(playedId);
                } else {
                    self.botLastAction = time + 500; 
                }
            }
        }
        // --- 4. СНАРЯДЫ И HP БАРЫ ---
        projectiles.children.entries.forEach(p => {
            let target = p.getData('target'); 
            if (!target || !target.active) { p.destroy(); return; }
            
            if (Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y) < 15) {
                if (isHost) {
                    target.getData('isT') ? updateTowerHP(self, target, p.getData('dmg')) : applyUnitDmg(target, p.getData('dmg'), p.getData('dbKey'));
                }
                p.destroy();
            } else { 
                let angle = Phaser.Math.Angle.Between(p.x, p.y, target.x, target.y); 
                p.x += Math.cos(angle) * 10; 
                p.y += Math.sin(angle) * 10; 
                p.rotation = angle; 
            }
        });
        
        hpBarsGroup.children.entries.forEach(bar => {
            let owner = bar.getData('owner'); 
            if (!owner || !owner.active) {
                bar.destroy();
            } else { 
                bar.setPosition(owner.x, owner.y - 20); 
                bar.width = Math.max(0, (owner.getData('hp') / owner.getData('maxHp')) * 25); 
            }
        });

        // --- 5. ОСНОВНАЯ ИГРОВАЯ ЛОГИКА (ЮНИТЫ И БАШНИ) ---
        if (time > lastLogic + 100) {
            lastLogic = time; 
            
            if (gameState.tiebreakerStarted && isHost) {
                Object.keys(unitsMap).forEach(k => applyUnitDmg(unitsMap[k], 9999, k)); 
                towerGroup.children.entries.forEach(t => { if(t.active) updateTowerHP(self, t, 15); }); 
                return; 
            }

            // ЛОГИКА ЮНИТОВ
            Object.keys(unitsMap).forEach(id => {
                let u = unitsMap[id]; 
                if (!u || !u.active) return;
                
                if (time < (u.getData('freezeUntil') || 0)) {
                    u.body.setVelocity(0); 
                    u.setData('isMoving', false);
                    return; 
                }
                
                // --- СКОРОСТЬ ПОЯВЛЕНИЯ (SPAWN DELAY С ЧАСИКАМИ) ---
                let spawnEnd = u.getData('spawnEnd');
                if (time < spawnEnd) {
                    u.body.setVelocity(0); 
                    u.setData('isMoving', false);
                    let sBar = u.getData('spawnBar'); // Это наши круговые часики
                    if (sBar) {
                        // Прогресс от 0 до 1, триггерит сеттер ширины для перерисовки круга
                        let pct = 1 - ((spawnEnd - time) / u.getData('spawnDuration'));
                        sBar.width = Math.max(0, 20 * pct); 
                    }
                    return; 
                } else {
                    let sBar = u.getData('spawnBar'); 
                    let sBg = u.getData('spawnBg');
                    if (sBar) { sBar.destroy(); u.setData('spawnBar', null); }
                    if (sBg) { sBg.destroy(); u.setData('spawnBg', null); }
                }

                if (u.getData('isJumping')) return;
                
                let type = u.getData('type'); 
                let side = u.getData('owner'); 
                let target = u.getData('lockedTarget');
                let range = u.getData('atkRange'); 
                
                if (target && target.active) {
                    let cId = target.getData('id') || target.getData('dbKey');
                    if (u.getData('lastTargetId') !== cId) {
                        u.setData('lastTargetId', cId);
                        u.setData('lockStartTime', time); 
                    }
                } else {
                    u.setData('lastTargetId', null);
                    u.setData('wasAttacking', false); // Сброс атаки
                }

                // Логика Принца (разгон)
                if (type === 'prince') {
                    if (!u.getData('isMoving') || (target && target.active && Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y) <= range)) {
                        u.setData('chargeTime', 0);
                        if (u.getData('inCharge')) { 
                            u.setData('inCharge', false); 
                            u.setData('spd', u.getData('baseSpd')); 
                            if(u.getData('cFX')) u.getData('cFX').destroy(); 
                        }
                    } else {
                        let ct = (u.getData('chargeTime') || 0) + 100; 
                        u.setData('chargeTime', ct);
                        if (ct >= 3000 && !u.getData('inCharge')) {
                            u.setData('inCharge', true); 
                            u.setData('spd', u.getData('baseSpd') * 2); 
                            let f = self.add.circle(0, 0, 15, 0xe74c3c, 0.5); 
                            u.add(f); 
                            u.setData('cFX', f);
                        }
                    }
                }
                
                // Деградация зданий
                if (time > (u.getData('lastDecay') || 0) + 1000 && u.getData('isB') && isHost) { 
                    u.setData('lastDecay', time); 
                    let decayAmt = u.getData('maxHp') / (type === 'cannon' ? 35 : 30); 
                    applyUnitDmg(u, decayAmt, id); 
                }
                
                // Поиск цели
                let possibleTargets = [...towerGroup.children.entries.filter(t => t.getData('side') !== side && t.active)];
                if (type !== 'giant') {
                    possibleTargets = possibleTargets.concat(Object.values(unitsMap).filter(eu => eu.active && eu.getData('owner') !== side && !eu.getData('isB') && (!eu.getData('isFlying') || u.getData('hitsAir')))).concat(Object.values(unitsMap).filter(b => b.getData('isB') && b.getData('owner') !== side && b.active));
                }
                
                let distT = target && target.active ? Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y) : 9999;
                let isAttacking = distT <= range && !u.getData('isB');
                
                if (!isAttacking) {
                    let newTarget = self.physics.closest(u, possibleTargets);
                    if (newTarget) {
                        target = newTarget; 
                        u.setData('lockedTarget', target);
                        distT = Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y);
                    }
                }

                if (target && target.active && !u.getData('isB')) {
                    if (distT <= range) {
                        u.body.setVelocity(0); 
                        u.setData('isMoving', false);
                        u.rotation = Phaser.Math.Angle.Between(u.x, u.y, target.x, target.y) + Math.PI/2;
                        
                        // Задержка перед первой атакой
                        if (!u.getData('wasAttacking')) {
                            u.setData('lastAtk', time - u.getData('atkSpd') + u.getData('firstAtkDelay'));
                            u.setData('wasAttacking', true);
                        }

                        if (type === 'icespirit') {
                            u.setData('isJumping', true);
                            self.tweens.add({
                                targets: u, y: u.y - 15, scaleX: 1.4, scaleY: 1.4, duration: 250, yoyo: true,
                                onComplete: () => {
                                    if (isHost && u.active) {
                                        push(eventsRef, {type:'freeze_boom', x: target.x, y: target.y, owner: side});
                                        applyUnitDmg(u, 9999, id); 
                                    }
                                }
                            });
                            return; 
                        }

                        // Атака
                        if (time > (u.getData('lastAtk') || 0) + u.getData('atkSpd')) {
                            u.setData('lastAtk', time); 
                            let dmg = u.getData('pwr');
                            
                            if (type === 'prince' && u.getData('inCharge')) { 
                                dmg *= 2; 
                                u.setData('chargeTime', 0); 
                                u.setData('inCharge', false); 
                                u.setData('spd', u.getData('baseSpd')); 
                                if(u.getData('cFX')) u.getData('cFX').destroy(); 
                            }
                            
                            if (type === 'valkyrie') {
                                let slash = self.add.circle(u.x, u.y, range, 0xffffff, 0.4).setDepth(40);
                                self.tweens.add({targets: slash, alpha: 0, scale: 1.1, duration: 200, onComplete: () => slash.destroy()});
                                if (isHost) {
                                    possibleTargets.forEach(pt => {
                                        if (pt.active && Phaser.Math.Distance.Between(u.x, u.y, pt.x, pt.y) <= range + 10) {
                                            pt.getData('isT') ? updateTowerHP(self, pt, dmg) : applyUnitDmg(pt, dmg, pt.getData('dbKey'));
                                        }
                                    });
                                }
                            }
                            else if (type === 'archer' || type === 'speargoblin') {
                                launchProj(self, u, target, dmg, type==='archer' ? 'arrow' : 'spear', target.getData('dbKey'));
                            }
                            else if (isHost) {
                                target.getData('isT') ? updateTowerHP(self, target, dmg) : applyUnitDmg(target, dmg, target.getData('dbKey'));
                            }
                        }
                    } else { 
                        // Движение
                        u.setData('wasAttacking', false); 
                        let destX = target.x, destY = target.y;
                        if (!u.getData('isFlying')) {
                            let targetIsAcross = (u.y < 280 && target.y > 320) || (u.y > 320 && target.y < 280);
                            if (targetIsAcross) {
                                let absBX = (u.getData('lane') === 'left') ? 100 : 300;
                                destX = isHost ? absBX : 400 - absBX; 
                                destY = (u.y < 280) ? 340 : 260; 
                            }
                        }
                        self.physics.moveTo(u, destX, destY, u.getData('spd'));
                        u.rotation = Phaser.Math.Angle.Between(u.x, u.y, destX, destY) + Math.PI/2;
                        u.setData('isMoving', true); 
                    }
                } else if (u.getData('isB') && target && target.active && distT <= range && (!target.getData('isFlying') || u.getData('hitsAir'))) {
                    if (u.getData('weapon')) u.getData('weapon').rotation = Phaser.Math.Angle.Between(u.x, u.y, target.x, target.y) + Math.PI/2;
                    
                    if (!u.getData('wasAttacking')) {
                        u.setData('lastAtk', time - u.getData('atkSpd') + u.getData('firstAtkDelay'));
                        u.setData('wasAttacking', true);
                    }

                    if (time > (u.getData('lastAtk') || 0) + u.getData('atkSpd')) { 
                        u.setData('lastAtk', time); 
                        let dmg = u.getData('pwr');
                        
                        if (type === 'inferno') {
                            let lockDuration = time - (u.getData('lockStartTime') || time);
                            let bonusSteps = Math.floor(lockDuration / 200); 
                            dmg = Math.min(600, 50 + (bonusSteps * 15)); 
                            
                            let beamCol = dmg > 300 ? 0xff0000 : (dmg > 150 ? 0xe67e22 : 0xf1c40f);
                            let beam = self.add.line(0, 0, u.x, u.y, target.x, target.y, beamCol).setOrigin(0).setLineWidth((dmg/100) + 1).setDepth(45);
                            self.time.delayedCall(100, () => beam.destroy());
                            
                            if (isHost) target.getData('isT') ? updateTowerHP(self, target, dmg) : applyUnitDmg(target, dmg, target.getData('dbKey'));
                        } else {
                            launchProj(self, u, target, dmg, 'ball', target.getData('dbKey')); 
                        }
                    }
                }
            });
            
            // ЛОГИКА БАШЕН
            towerGroup.children.entries.forEach(t => {
                if (!t.active) return;
                if (time < (t.getData('freezeUntil') || 0)) return;
                
                // Активация короля
                if (t.getData('isM') && !t.getData('isA')) {
                    let sideTowers = towerGroup.children.entries.filter(ot => ot.getData('side') === t.getData('side') && !ot.getData('isM') && ot.active);
                    if (t.getData('hp') < t.getData('maxHp') || sideTowers.length < 2) {
                        t.setData('isA', true); 
                        if(t.getData('weapon')) t.getData('weapon').setVisible(true);
                    }
                }
                
                if (!t.getData('isA')) return;
                
                let enemies = Object.values(unitsMap).filter(u => u.active && u.getData('owner') !== t.getData('side'));
                let closest = self.physics.closest(t, enemies);
                let tRange = t.getData('atkRange');
                
                if (closest && Phaser.Math.Distance.Between(t.x, t.y, closest.x, closest.y) <= tRange) {
                    if (t.getData('weapon')) t.getData('weapon').rotation = Phaser.Math.Angle.Between(t.x, t.y, closest.x, closest.y) + Math.PI/2;
                    
                    let cId = closest.getData('id') || closest.getData('dbKey');
                    if (t.getData('lastTargetId') !== cId) {
                        t.setData('lastTargetId', cId);
                        t.setData('lastS', time - t.getData('atkSpd') + t.getData('firstAtkDelay')); 
                    }

                    if (time > t.getData('lastS') + t.getData('atkSpd')) { 
                        t.setData('lastS', time); 
                        launchProj(self, t, closest, t.getData('pwr'), t.getData('isM') ? 'ball' : 'arrow', closest.getData('dbKey')); 
                    }
                } else {
                    t.setData('lastTargetId', null); 
                }
            });
        }
    }
}; // <-- ЗАКРЫВАЕТ ОБЪЕКТ GameScene
// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ И ЛОГИКА ЗАКЛИНАНИЙ
// ==========================================

function handleSpawn(scene, data, key) {
    let tx = isHost ? data.x : 400 - data.x; 
    let ty = isHost ? data.y : 600 - data.y;
    let currTime = scene.time.now;
    
    // --- 1. ФАЕРБОЛ (С параболой) ---
    if (data.type === 'fireball') {
        let spr = scene.add.circle(tx, (data.owner === playerRole ? 850 : -50), 15, 0xe67e22).setDepth(60);
        
        scene.tweens.add({ targets: spr, scale: 1.8, duration: 750, yoyo: true });
        scene.tweens.add({ targets: spr, x: tx, y: ty, duration: 1500, 
            onUpdate: () => {
                let sz = Math.random() * 6 + 4;
                let p = scene.add.rectangle(spr.x + (Math.random()-0.5)*20, spr.y + (Math.random()-0.5)*20, sz, sz, Math.random() > 0.5 ? 0xf1c40f : 0xe74c3c).setDepth(59);
                scene.tweens.add({targets: p, alpha: 0, scale: 0.1, duration: 500, onComplete: () => p.destroy()});
            },
            onComplete: () => { 
                spr.destroy(); 
                if (isHost) { 
                    push(eventsRef, { type: 'spell_boom', x: data.x, y: data.y, owner: data.owner, spellId: data.type }); 
                    remove(ref(db, `${gamePath}/units/${key}`)); 
                } 
            }
        }); 
        return;
    }
    
    // --- 2. РАКЕТА (С динамической параболой) ---
    if (data.type === 'rocket') {
        let startY = data.owner === playerRole ? 850 : -50;
        let spr = scene.add.container(tx, startY).setDepth(65);
        
        spr.add(scene.add.rectangle(0, 0, 16, 40, 0x8b4513)); 
        spr.add(scene.add.rectangle(-4, 0, 2, 40, 0x5c2e0b)); 
        spr.add(scene.add.rectangle(4, 0, 2, 40, 0x5c2e0b)); 
        spr.add(scene.add.triangle(0, -20, -10, 0, 10, 0, 0, -15, 0x7f8c8d)); 
        
        let angle = Phaser.Math.Angle.Between(tx, startY, tx, ty) + Math.PI/2;
        spr.rotation = angle;

        let distY = Math.abs(startY - ty);
        let flightTime = 1000 + (distY / 800) * 3000;

        scene.tweens.add({ targets: spr, scale: 1.8, duration: flightTime / 2, yoyo: true });
        scene.tweens.add({ targets: spr, x: tx, y: ty, duration: flightTime, 
            onUpdate: () => {
                let pColor = Math.random() > 0.6 ? 0xf1c40f : (Math.random() > 0.3 ? 0xe67e22 : 0xc0392b);
                let p = scene.add.rectangle(spr.x + (Math.random()-0.5)*15, spr.y + 20, Math.random()*6+4, Math.random()*6+4, pColor).setDepth(64);
                scene.tweens.add({targets: p, alpha: 0, scale: 0.1, duration: 600, onComplete: () => p.destroy()});
            },
            onComplete: () => { 
                spr.destroy(); 
                if (isHost) { 
                    push(eventsRef, { type: 'spell_boom', x: data.x, y: data.y, owner: data.owner, spellId: data.type }); 
                    remove(ref(db, `${gamePath}/units/${key}`)); 
                } 
            }
        }); 
        return;
    }
    
    // --- 3. СТРЕЛЫ ---
    if (data.type === 'arrows') {
        let spr = scene.add.container(tx, (data.owner === playerRole ? 850 : -50)).setDepth(60);
        
        for(let i = 0; i < 15; i++) { 
            spr.add(scene.add.rectangle((Math.random()-0.5)*70, (Math.random()-0.5)*70, 2, 20, 0x5d4037)); 
        }
        
        scene.tweens.add({ targets: spr, x: tx, y: ty, duration: 2000, 
            onComplete: () => { 
                scene.time.delayedCall(50, () => { spr.destroy(); }); 
                if (isHost) { 
                    push(eventsRef, { type: 'spell_boom', x: data.x, y: data.y, owner: data.owner, spellId: data.type }); 
                    remove(ref(db, `${gamePath}/units/${key}`)); 
                } 
            }
        }); 
        return;
    }
    
    // --- 4. БОЧКА ГОБЛИНОВ (С параболой) ---
    if (data.type === 'goblinbarrel') {
        let startY = data.owner === playerRole ? 850 : -50;
        let spr = scene.add.container(tx, startY).setDepth(60);
        
        spr.add(scene.add.rectangle(0, 0, 20, 30, 0xa0522d)); 
        spr.add(scene.add.rectangle(0, -10, 24, 4, 0x8b4513)); 
        spr.add(scene.add.rectangle(0, 10, 24, 4, 0x8b4513)); 

        scene.tweens.add({ targets: spr, scale: 2.0, duration: 1750, yoyo: true });
        scene.tweens.add({ targets: spr, x: tx, y: ty, angle: 720, duration: 3500, 
            onComplete: () => { 
                spr.destroy(); 
                if (isHost) { 
                    push(eventsRef, { type: 'barrel_drop', x: data.x, y: data.y, owner: data.owner }); 
                    remove(ref(db, `${gamePath}/units/${key}`)); 
                } 
            }
        }); 
        return;
    }

    // --- 5. БРЕВНО ---
    if (data.type === 'log' && isHost) { 
        push(eventsRef, { type: 'logRoll', x: data.x, y: data.y, owner: data.owner }); 
        remove(ref(db, `${gamePath}/units/${key}`)); 
        return; 
    }
    
    // ==========================================
    // ТОТАЛЬНЫЙ РЕБАЛАНС СТАТИСТИКИ ЮНИТОВ
    // ==========================================
    let cfgs = { 
        // Валька (p: 300) ваншотает Гоблина (h: 280), Рыцарь (p: 150) бьет за два удара.
        knight:      {s: 20, p: 150, h: 1600, sz: 22, a: 1200, atkRange: 20,  firstAtkDelay: 600, spawnDuration: 500}, 
        valkyrie:    {s: 20, p: 300, h: 1800, sz: 22, a: 1400, atkRange: 25,  firstAtkDelay: 700, spawnDuration: 600}, 
        giant:       {s: 13, p: 120, h: 4000, sz: 24, a: 1500, atkRange: 25,  firstAtkDelay: 800, spawnDuration: 800}, 
        archer:      {s: 17, p: 150, h: 500,  sz: 16, a: 1200, atkRange: 140, firstAtkDelay: 500, spawnDuration: 500}, 
        goblin:      {s: 40, p: 120, h: 280,  sz: 14, a: 1000, atkRange: 20,  firstAtkDelay: 400, spawnDuration: 300}, 
        speargoblin: {s: 35, p: 100, h: 250,  sz: 14, a: 1300, atkRange: 125, firstAtkDelay: 400, spawnDuration: 400}, 
        minipekka:   {s: 35, p: 450, h: 1400, sz: 20, a: 1600, atkRange: 20,  firstAtkDelay: 500, spawnDuration: 600}, 
        cannon:      {s: 0,  p: 150, h: 1800, sz: 50, isB: true, a: 1000, atkRange: 140, firstAtkDelay: 500, spawnDuration: 300}, 
        inferno:     {s: 0,  p: 50,  h: 1500, sz: 50, isB: true, a: 200,  atkRange: 150, firstAtkDelay: 400, spawnDuration: 500}, 
        minion:      {s: 40, p: 140, h: 400,  sz: 14, a: 1100, atkRange: 35,  firstAtkDelay: 400, spawnDuration: 500, isFlying: true}, 
        skeleton:    {s: 35, p: 60,  h: 120,  sz: 10, a: 1000, atkRange: 20,  firstAtkDelay: 300, spawnDuration: 200}, 
        prince:      {s: 18, p: 250, h: 1700, sz: 22, a: 1500, atkRange: 30,  firstAtkDelay: 600, spawnDuration: 700},
        icespirit:   {s: 40, p: 80,  h: 100,  sz: 14, a: 1000, atkRange: 60,  firstAtkDelay: 200, spawnDuration: 100} 
    };
    
    let c = cfgs[data.type]; 
    
    if (isHost && data.hp === undefined) {
        dbUpdate(ref(db, `${gamePath}/units/${key}`), { hp: c.h }); 
    }
    
    createU(scene, tx, ty, data.owner, c, data.type, key, data.lane, currTime);
}
function doSpellBoom(scene, x, y, owner, type) {
    let tx = isHost ? x : 400 - x; 
    let ty = isHost ? y : 600 - y; 
    let isFB = type === 'fireball'; 
    let isRocket = type === 'rocket'; 
    
    // Радиусы заклинаний
    let rad = isRocket ? 40 : (isFB ? 60 : 80); 
    
    // Визуальные эффекты взрыва
    if (isFB || isRocket) {
        let col = isRocket ? 0xc0392b : 0xe67e22; 
        let f = scene.add.circle(tx, ty, rad, col, 0.8).setDepth(50);
        scene.time.delayedCall(isRocket ? 500 : 300, () => { if(f) f.destroy(); }); 
    } else {
        // Эффект для стрел
        let a = scene.add.circle(tx, ty, rad, 0xe74c3c, 0.4).setDepth(50);
        scene.time.delayedCall(100, () => { if(a) a.destroy(); }); 
    }

    if (isHost) {
        // УРОН ОТ ЗАКЛИНАНИЙ (РЕБАЛАНС)
        let tDmg = isRocket ? 480 : (isFB ? 250 : 140); 
        let uDmg = isRocket ? 1200 : (isFB ? 600 : 350); 
        
        towerGroup.children.entries.forEach(t => { 
            if (t.active && Phaser.Math.Distance.Between(tx, ty, t.x, t.y) < rad + 20 && t.getData('side') !== owner) {
                updateTowerHP(scene, t, tDmg); 
            }
        });
        
        Object.values(unitsMap).forEach(u => { 
            if (u.active && Phaser.Math.Distance.Between(tx, ty, u.x, u.y) < rad && u.getData('owner') !== owner) {
                applyUnitDmg(u, uDmg, u.getData('dbKey')); 
            }
        });
    }
}

function doLogRoll(scene, x, y, owner, key) {
    let tx = isHost ? x : 400 - x; 
    let ty = isHost ? y : 600 - y; 
    
    let logSpr = scene.add.container(tx, ty).setDepth(45);
    logSpr.add([
        scene.add.rectangle(0, 0, 70, 20, 0xd35400), 
        scene.add.rectangle(-20, 0, 4, 24, 0x7f8c8d), 
        scene.add.rectangle(0, 0, 4, 24, 0x7f8c8d), 
        scene.add.rectangle(20, 0, 4, 24, 0x7f8c8d)
    ]);
    
    let hitSet = new Set();
    
    scene.tweens.add({ 
        targets: logSpr, 
        y: ty + (owner === playerRole ? -280 : 280), 
        duration: 1500,
        onUpdate: () => { 
            if (isHost) {
                Object.keys(unitsMap).forEach(k => { 
                    let u = unitsMap[k]; 
                    if (u.active && u.getData('owner') !== owner && !u.getData('isB') && !u.getData('isFlying') && !hitSet.has(k) && Math.abs(logSpr.x - u.x) < 50 && Math.abs(logSpr.y - u.y) < 30) { 
                        
                        applyUnitDmg(u, 300, k); // Урон бревна по юнитам: 300
                        hitSet.add(k); 
                        
                        // МИКРО-СТАН (КОНТУЗИЯ 0.3 сек) И ОТБРАСЫВАНИЕ
                        u.setData('freezeUntil', scene.time.now + 300);
                        u.y += (owner === 'me' ? -15 : 15);
                        
                        // СБРОС ШТУРМА ПРИНЦА
                        if (u.getData('type') === 'prince') {
                            u.setData('inCharge', false); 
                            u.setData('chargeTime', 0); 
                            u.setData('spd', u.getData('baseSpd')); 
                            if(u.getData('cFX')) u.getData('cFX').destroy();
                        }
                    } 
                });
                
                towerGroup.children.entries.forEach(t => { 
                    if (t.active && t.getData('side') !== owner && !hitSet.has(t.getData('id')) && Math.abs(logSpr.x - t.x) < 60 && Math.abs(logSpr.y - t.y) < 40) { 
                        updateTowerHP(scene, t, 120); // Урон бревна по башне: 120
                        hitSet.add(t.getData('id')); 
                    } 
                });
            } 
        }, 
        onComplete: () => { 
            logSpr.destroy(); 
            if(isHost) remove(ref(db, `${gamePath}/events/${key}`)); 
        }
    });
}

function doFreezeBoom(scene, x, y, owner) {
    let tx = isHost ? x : 400 - x; 
    let ty = isHost ? y : 600 - y; 
    let rad = 35; 
    
    let iceFX = scene.add.circle(tx, ty, rad, 0x87CEEB, 0.5).setDepth(50);
    scene.tweens.add({targets: iceFX, alpha: 0, duration: 1500, onComplete: () => iceFX.destroy()});
    
    let currTime = scene.time.now;
    
    towerGroup.children.entries.forEach(t => {
        if (t.active && Phaser.Math.Distance.Between(tx, ty, t.x, t.y) < rad + 20 && t.getData('side') !== owner) {
            t.setData('freezeUntil', currTime + 1500); 
            let fz = scene.add.rectangle(t.x, t.y, 40, 40, 0x87CEEB, 0.5).setDepth(40);
            scene.time.delayedCall(1500, () => fz.destroy());
            if(isHost) updateTowerHP(scene, t, 80); // Урон ледяного духа по башне: 80
        }
    });
    
    Object.values(unitsMap).forEach(u => {
        if (u.active && Phaser.Math.Distance.Between(tx, ty, u.x, u.y) < rad && u.getData('owner') !== owner) {
            u.setData('freezeUntil', currTime + 1500);
            let fz = scene.add.rectangle(u.x, u.y, 20, 20, 0x87CEEB, 0.5).setDepth(40);
            scene.time.delayedCall(1500, () => fz.destroy());
            if(isHost) applyUnitDmg(u, 80, u.getData('dbKey')); // Урон ледяного духа по юнитам: 80
        }
    });
}
// ==========================================
// СОЗДАНИЕ ЮНИТОВ И БАШЕН
// ==========================================
function createU(scene, x, y, owner, c, type, key, lane, currTime) {
    let isMe = owner === playerRole; 
    let u = scene.add.container(x, y).setDepth(c.isFlying ? 20 : 15); 
    scene.physics.add.existing(u); 
    u.body.setSize(c.sz, c.sz).setOffset(-c.sz/2, -c.sz/2); 
    
    let dirY = -1; 
    let teamCol = isMe ? 0x2980b9 : 0xc0392b; 
    
    // Модельки юнитов (оставил их аккуратными и минималистичными)
    if (type === 'cannon') {
        u.add(scene.add.rectangle(0, 0, 50, 50, 0x6e4b30)); 
        let gunGrp = scene.add.container(0, 0);
        gunGrp.add(scene.add.circle(0, 0, 12, 0x7f8c8d)); 
        gunGrp.add(scene.add.rectangle(0, dirY*15, 10, 30, 0x7f8c8d)); 
        u.add(gunGrp); 
        u.setData('weapon', gunGrp);
    }
    else if (type === 'inferno') {
        u.add(scene.add.rectangle(0, 0, 50, 50, 0x34495e)); 
        u.add(scene.add.rectangle(0, 0, 30, 30, 0x2c3e50)); 
        u.add(scene.add.circle(0, 0, 12, 0xd35400)); 
    }
    else if (type === 'skeleton') {
        u.add(scene.add.rectangle(0, 0, c.sz, c.sz, 0xffffff));
    }
    else if (type === 'icespirit') {
        u.add(scene.add.circle(0, 0, 8, 0x87CEEB)); 
        u.add(scene.add.rectangle(0, dirY*4, 10, 3, 0xffffff)); 
    }
    else if (type === 'prince') {
        u.add(scene.add.rectangle(0, dirY*5, 18, 35, 0x6e4b30)); 
        u.add(scene.add.rectangle(0, dirY*25, 10, 16, 0x4a321f)); 
        u.add(scene.add.rectangle(0, dirY*20, 14, 6, 0xf1c40f)); 
        u.add(scene.add.rectangle(0, 0, 18, 18, 0xf1c40f)); 
        u.add(scene.add.rectangle(0, dirY*2, 10, 10, 0xd4ac0d)); 
        let spear = scene.add.container(14, dirY*10);
        spear.add(scene.add.rectangle(0, 0, 4, 40, 0xffffff)); 
        for(let i = -15; i <= 15; i += 8) spear.add(scene.add.rectangle(0, i, 4, 4, teamCol)); 
        u.add(spear);
    } 
    else if (type === 'valkyrie') {
        u.add(scene.add.rectangle(0, 0, 16, 16, 0x8b4513)); 
        u.add(scene.add.circle(0, dirY*4, 7, 0xe67e22)); 
        u.add(scene.add.rectangle(12, 0, 3, 22, 0x7f8c8d)); 
        u.add(scene.add.rectangle(12, dirY*6, 10, 8, 0xbdc3c7)); 
    } 
    else if (type === 'giant') {
        u.add(scene.add.rectangle(0, 0, 24, 20, 0x8b4513)); 
        u.add(scene.add.rectangle(0, 0, 16, 16, 0xffcc99)); 
        u.add(scene.add.rectangle(-18, 0, 14, 14, 0xffcc99)); 
        u.add(scene.add.rectangle(18, 0, 14, 14, 0xffcc99)); 
    } 
    else if (type === 'archer') {
        u.add(scene.add.circle(0, 0, 8, 0xe84393)); 
    } 
    else if (type === 'minipekka') { 
        u.add(scene.add.rectangle(0, 0, c.sz, c.sz, 0x34495e)); 
        u.add(scene.add.rectangle(c.sz/2+4, dirY*6, 6, 22, 0x2980b9)); 
        u.add(scene.add.rectangle(0, dirY*2, 10, 4, 0x00ffff)); 
    } 
    else if (type === 'knight') {
        u.add(scene.add.rectangle(0, 0, c.sz, c.sz, 0x95a5a6)); 
        u.add(scene.add.rectangle(0, 0, c.sz-8, c.sz-8, 0x7f8c8d)); 
        u.add(scene.add.rectangle(0, dirY*(c.sz/2-4), 10, 4, 0xffcc99)); 
        u.add(scene.add.rectangle(c.sz/2+4, 0, 6, 6, 0xecf0f1)); 
    } 
    else {
        let body = scene.add.rectangle(0, 0, c.sz, c.sz, teamCol); 
        u.add(body);
        if (type === 'goblin' || type === 'barrelgoblin') { 
            body.setFillStyle(0x1abc9c); 
            u.add(scene.add.rectangle(c.sz/2+2, dirY*4, 2, 10, 0xecf0f1)); 
        } else if (type === 'speargoblin') {
            body.setFillStyle(0x2ecc71); 
            u.add(scene.add.rectangle(c.sz/2+2, dirY*4, 2, 18, 0x8b4513)); 
        } else if (type === 'minion') {
            u.add([
                scene.add.rectangle(-8, dirY*2, 8, 12, 0x8e44ad), 
                scene.add.rectangle(8, dirY*2, 8, 12, 0x8e44ad)
            ]);
        }
    }

    u.rotation = isMe ? 0 : Math.PI;

    // --- НАСТОЯЩИЕ ЧАСИКИ (Радиальное заполнение) ---
    let sClock = scene.add.graphics().setDepth(22);
    sClock.x = x; sClock.y = y - 12;
    
    Object.defineProperty(sClock, 'width', {
        set: function(val) {
            let p = val / 20; // от 0 до 1
            this.clear();
            this.fillStyle(0x000000, 0.8);
            this.fillCircle(0, 0, 10);
            
            this.fillStyle(0xbdc3c7, 1);
            this.beginPath();
            this.moveTo(0, 0);
            this.arc(0, 0, 10, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * p));
            this.lineTo(0, 0);
            this.fill();
        }
    });

    u.setData({
        spd: c.s, baseSpd: c.s, pwr: c.p, type: type, owner: owner, lane: lane, 
        hp: c.h, maxHp: c.h, dbKey: key, 
        isB: !!c.isB, atkSpd: c.a, 
        isFlying: !!c.isFlying, hitsAir: (type === 'archer' || type === 'speargoblin' || type === 'inferno'),
        chargeTime: 0, inCharge: false, isMoving: false,
        atkRange: c.atkRange, firstAtkDelay: c.firstAtkDelay,
        spawnDuration: c.spawnDuration, spawnEnd: currTime + c.spawnDuration, 
        spawnBg: null, spawnBar: sClock, wasAttacking: false
    });
    
    let barCol = isMe ? 0x2ecc71 : 0xe74c3c;
    let hpBar = scene.add.rectangle(x, y-20, 25, 3, barCol).setDepth(21).setData('owner', u);
    hpBarsGroup.add(hpBar); 
    
    unitsMap[key] = u;
}

function destroyUnit(id) { 
    if (unitsMap[id]) { 
        let u = unitsMap[id];
        let hpB = u.getData('hpBar'); if(hpB) hpB.destroy(); 
        let cFX = u.getData('cFX'); if(cFX) cFX.destroy(); 
        let sBar = u.getData('spawnBar'); if(sBar) sBar.destroy();
        u.destroy(); 
        delete unitsMap[id]; 
    } 
}

function destroyTower(scene, t) { 
    if (!t.active) return; 
    
    if (!t.getData('isM')) { 
        let k = towerGroup.children.entries.find(it => it.getData('isM') && it.getData('side') === t.getData('side')); 
        if (k) {
            k.setData('isA', true); 
            if(k.getData('weapon')) k.getData('weapon').setVisible(true);
        } 
    } 
    
    if (t.getData('isM') || gameState.isOvertime || gameState.tiebreakerStarted) {
        isGameOver = true; 
        let iWon = t.getData('side') !== playerRole;
        scene.add.text(60, 300, iWon ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ!', {fontSize:'45px', fill: iWon ? '#f1c40f' : '#e74c3c', fontStyle:'bold'}).setDepth(200); 
        
        if (!isSpectator && !scene.trophyAwarded) {
            scene.trophyAwarded = true;
            if (isBotMode && iWon) myBotTrophies++; 
            else if (!isBotMode && iWon) myTrophies++; 
            
            let res = iWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
            battleHistory.push({ res: res, date: new Date().toLocaleTimeString(), vs: isBotMode ? 'Бот' : 'Онлайн Игрок' });
            if (battleHistory.length > 10) battleHistory.shift();
            
            if (myNickname) dbUpdate(ref(db, `users/${myNickname}`), { trophies: myTrophies, botTrophies: myBotTrophies, history: battleHistory });
            localStorage.setItem('bbr_history', JSON.stringify(battleHistory));
            localStorage.setItem('bbr_trophies', myTrophies);
            localStorage.setItem('bbr_bot_trophies', myBotTrophies);
        }
    }
    
    let bg = t.getData('bg'); if(bg) bg.destroy(); 
    let bar = t.getData('bar'); if(bar) bar.destroy(); 
    t.destroy(); 
}

function setupTowers(scene) { 
    towerGroup.clear(true, true); 
    const ts = [
        {id:'eL', x:100, y:100, s:'enemy', m:false, l:'left'}, 
        {id:'eR', x:300, y:100, s:'enemy', m:false, l:'right'}, 
        {id:'eM', x:200, y:50,  s:'enemy', m:true,  l:'mid'}, 
        {id:'mL', x:100, y:500, s:'me',    m:false, l:'left'}, 
        {id:'mR', x:300, y:500, s:'me',    m:false, l:'right'}, 
        {id:'mM', x:200, y:550, s:'me',    m:true,  l:'mid'}
    ];
    
    ts.forEach(d => { 
        let tx = isHost ? d.x : 400 - d.x; 
        let ty = isHost ? d.y : 600 - d.y; 
        let isMe = d.s === playerRole; 
        let col = isMe ? 0x2980b9 : 0xc0392b; 
        let w = d.m ? 50 : 40; 
        
        let t = scene.add.container(tx, ty).setDepth(5); 
        scene.physics.add.existing(t, true); 
        t.body.setSize(w, w).setOffset(-w/2, -w/2); 
        
        t.add(scene.add.rectangle(0, 0, w, w, 0x7f8c8d));
        t.add(scene.add.rectangle(0, 0, w-10, w-10, 0x34495e));
        
        let dirY = isMe ? -1 : 1;
        if (d.m) {
            t.add(scene.add.rectangle(0, -dirY * (w/2 - 4), 30, 8, col)); 
            t.add(scene.add.rectangle(0, 0, 20, 10, col)); 
            t.add(scene.add.circle(0, dirY * 2, 8, 0xffcc99)); 
            t.add(scene.add.rectangle(0, dirY * 6, 10, 4, 0x8b4513)); 
            t.add(scene.add.rectangle(0, -dirY * 2, 12, 4, 0xf1c40f)); 
            let kingCannon = scene.add.rectangle(0, dirY * 15, 8, 16, 0x000000);
            kingCannon.setVisible(false); 
            t.add(kingCannon); 
            t.setData('weapon', kingCannon);
        } else {
            t.add(scene.add.rectangle(0, -dirY * (w/2 - 4), 20, 8, col)); 
            t.add(scene.add.circle(0, 0, 8, 0xe84393)); 
            let bow = scene.add.rectangle(0, dirY * 12, 16, 3, 0x8b4513);
            t.add(bow); 
            t.setData('weapon', bow);
        }

        towerGroup.add(t); 
        let barCol = isMe ? 0x2ecc71 : 0xe74c3c; 
        let tHp = d.m ? 5000 : 3000;
        let tPwr = d.m ? 180 : 150;
        let tRng = d.m ? 160 : 140; 
        
        t.setData({
            id: d.id, hp: tHp, maxHp: tHp, pwr: tPwr, side: d.s, isM: d.m, isA: !d.m, lane: d.l, 
            isT: true, lastS: 0, atkSpd: 1000, firstAtkDelay: 500, atkRange: tRng, 
            bar: scene.add.rectangle(tx, ty-35, d.m ? 60 : 40, 6, barCol).setDepth(11), 
            bg: scene.add.rectangle(tx, ty-35, d.m ? 60 : 40, 6, 0x333333).setDepth(10)
        }); 
    });
    
    if (isHost) ts.forEach(d => { dbUpdate(ref(db, `${gamePath}/towers/${d.id}`), { hp: d.m ? 5000 : 3000 }); }); 
}

function launchProj(scene, s, target, dmg, type, key) { 
    let p;
    if (type === 'arrow') p = scene.add.rectangle(s.x, s.y, 10, 2, 0x5d4037);
    else if (type === 'spear') p = scene.add.rectangle(s.x, s.y, 18, 3, 0x8b4513); 
    else p = scene.add.circle(s.x, s.y, 8, 0x2c3e50);
    projectiles.add(p.setDepth(40).setData({target: target, dmg: dmg, dbKey: key})); 
}

function applyUnitDmg(u, d, key) { 
    if (!isHost || !u || !u.active || !u.scene) return; 
    let actualKey = key || u.getData('dbKey'); 
    if (!actualKey) return; 
    
    let hp = Math.max(0, (u.getData('hp') || 0) - d); 
    u.setData('hp', hp); 
    
    if (hp <= 0) { 
        remove(ref(db, `${gamePath}/units/${actualKey}`)); 
        destroyUnit(actualKey); 
    } else { 
        dbUpdate(ref(db, `${gamePath}/units/${actualKey}`), { hp: hp }); 
    } 
}

function updateTowerHP(scene, t, d) { 
    if (!isHost || !t || !t.active || !t.scene) return; 
    let hp = Math.max(0, (t.getData('hp') || 0) - d); 
    t.setData('hp', hp); 
    
    if (hp <= 0) { 
        remove(ref(db, `${gamePath}/towers/${t.getData('id')}`)); 
        destroyTower(scene, t); 
    } else { 
        dbUpdate(ref(db, `${gamePath}/towers/${t.getData('id')}`), { hp: hp }); 
        if(t.getData('bar')) t.getData('bar').width = (hp / t.getData('maxHp')) * (t.getData('isM') ? 60 : 40); 
    } 
}

const gameConfig = Object.assign({}, config, { scene: [MenuScene, GameScene] }); 
const phaserGame = new Phaser.Game(gameConfig);
