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
let playerRole = null, isHost = false; 

const gamePath = "match_v101_emotes";
const unitsRef = ref(db, `${gamePath}/units`);
const eventsRef = ref(db, `${gamePath}/events`);
const towersRef = ref(db, `${gamePath}/towers`); 

let elixir = 5, elixirText, selectedCardObj = null, isGameOver = false;
let unitsMap = {}, towerGroup, projectiles, hpBarsGroup, roleText;
let timerText, phaseText, lastLogic = 0;
let gameState = { phase: '1x', startTime: 0, isOvertime: false, tiebreakerStarted: false, overtimeDecided: false };

window.allCardsData = [
    {id:'knight', c:3, color:0x3498db}, {id:'giant', c:5, color:0xe67e22},
    {id:'archers', c:3, color:0xe84393}, {id:'fireball', c:4, color:0xe74c3c},
    {id:'goblins', c:2, color:0x1abc9c}, {id:'minipekka', c:4, color:0x34495e}, 
    {id:'log', c:2, color:0xd35400}, {id:'cannon', c:3, color:0x7f8c8d},
    {id:'arrows', c:3, color:0x5d4037}, {id:'minions', c:3, color:0x2980b9},
    {id:'skeletons', c:1, color:0xffffff}, {id:'prince', c:5, color:0x8e44ad} 
];
window.userDeck = ['knight', 'giant', 'archers', 'fireball', 'minipekka', 'log', 'skeletons', 'prince'];

const config = {
    type: Phaser.AUTO, width: 400, height: 800, parent: 'game',
    physics: { default: 'arcade', arcade: { debug: false } }
};

const MenuScene = {
    key: 'MenuScene',
    create: function() {
        let self = this;
        this.add.rectangle(200, 400, 400, 800, 0x1a252f);
        let battleTab = this.add.container(0, 0);
        let deckTab = this.add.container(0, 0).setVisible(false);
        battleTab.add(this.add.text(200, 100, 'BUBABATTLE ROYALE', { fontSize: '28px', fill: '#f1c40f', fontStyle: 'bold' }).setOrigin(0.5));
        
        let btnBattle = this.add.rectangle(200, 400, 250, 100, 0xe74c3c).setInteractive();
        let txtBattle = this.add.text(200, 400, 'В БОЙ', { fontSize: '40px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        battleTab.add([btnBattle, txtBattle]);
        
        let isSearching = false;
        btnBattle.on('pointerdown', () => {
            if (isSearching) return;
            isSearching = true; btnBattle.setFillStyle(0xc0392b); txtBattle.setText('ПОИСК...');
            get(ref(db, `${gamePath}/players`)).then((snapshot) => {
                const players = snapshot.val() || {};
                playerRole = (players['me']) ? 'enemy' : 'me'; isHost = (playerRole === 'me');
                let myRef = ref(db, `${gamePath}/players/${playerRole}`);
                set(myRef, { ready: true }); onDisconnect(myRef).remove();
            });
            onValue(ref(db, `${gamePath}/players`), (snapshot) => {
                const players = snapshot.val() || {};
                if (players['me'] && players['me'].ready && players['enemy'] && players['enemy'].ready) {
                    if (isHost) set(ref(db, `${gamePath}/state`), { startTime: Date.now(), phase: '1x', isOvertime: false, tiebreakerStarted: false, overtimeDecided: false });
                    self.scene.start('GameScene');
                }
            });
        });
        
        let deckContainer = this.add.container(0, 0); deckTab.add(deckContainer);
        let selectedColId = null;
        let renderDeck = () => {
            deckContainer.removeAll(true);
            deckContainer.add(this.add.text(200, 100, 'АКТИВНАЯ КОЛОДА (8 КАРТ)', { fontSize: '18px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
            for(let i=0; i<8; i++) {
                let cData = window.allCardsData.find(c => c.id === window.userDeck[i]);
                let cx = 65 + (i%4)*90; let cy = 160 + Math.floor(i/4)*95;
                let btn = this.add.rectangle(cx, cy, 80, 80, cData.color).setInteractive();
                deckContainer.add([btn, this.add.text(cx, cy, cData.id.toUpperCase() + "\n💧" + cData.c, { fontSize: '10px', fill: '#000', align:'center', fontStyle:'bold' }).setOrigin(0.5)]);
                btn.on('pointerdown', () => { if (selectedColId && !window.userDeck.includes(selectedColId)) { window.userDeck[i] = selectedColId; selectedColId = null; renderDeck(); } });
            }
            window.allCardsData.forEach((cData, i) => {
                let cx = 55 + (i%5)*72; let cy = 420 + Math.floor(i/5)*95;
                let btn = this.add.rectangle(cx, cy, 65, 80, cData.color).setInteractive();
                if (selectedColId === cData.id) btn.setStrokeStyle(3, 0xf1c40f);
                deckContainer.add([btn, this.add.text(cx, cy, cData.id.toUpperCase() + "\n💧" + cData.c, { fontSize: '9px', fill: '#000', align:'center', fontStyle:'bold' }).setOrigin(0.5)]);
                if (window.userDeck.includes(cData.id)) deckContainer.add(this.add.rectangle(cx, cy, 65, 80, 0x000000, 0.6));
                btn.on('pointerdown', () => { if (!window.userDeck.includes(cData.id)) { selectedColId = cData.id; renderDeck(); } });
            });
        };
        renderDeck();
        
        this.add.rectangle(200, 750, 400, 100, 0x2c3e50);
        let navDeck = this.add.rectangle(100, 750, 190, 80, 0x2c3e50).setInteractive();
        let navBattle = this.add.rectangle(300, 750, 190, 80, 0x34495e).setInteractive();
        this.add.text(100, 750, '🃏 КОЛОДА', { fontSize: '20px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(300, 750, '⚔️ БОЙ', { fontSize: '20px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        navBattle.on('pointerdown', () => { battleTab.setVisible(true); deckTab.setVisible(false); navBattle.setFillStyle(0x34495e); navDeck.setFillStyle(0x2c3e50); });
        navDeck.on('pointerdown', () => { battleTab.setVisible(false); deckTab.setVisible(true); navDeck.setFillStyle(0x34495e); navBattle.setFillStyle(0x2c3e50); });
    }
};
const GameScene = {
    key: 'GameScene',
    create: function() {
        let self = this;
        elixir = 5; selectedCardObj = null; isGameOver = false; lastLogic = 0;
        unitsMap = {}; towerGroup = this.add.group(); projectiles = this.add.group(); hpBarsGroup = this.add.group();
        
        onValue(ref(db, `${gamePath}/state`), snap => { if(snap.val()) gameState = snap.val(); });

        let shuffledDeck = [...window.userDeck].sort(() => Math.random() - 0.5);
        self.handIds = shuffledDeck.slice(0, 4); self.nextIds = shuffledDeck.slice(4, 8);
        self.uiElements = [];
        roleText = this.add.text(10, 10, isHost ? "СИНИЕ (HOST)" : "КРАСНЫЕ (CLIENT)", {fontSize:'14px', fill:'#fff', fontStyle:'bold'}).setDepth(101);
        
        timerText = this.add.text(200, 25, '3:00', {fontSize:'28px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5).setDepth(101);
        phaseText = this.add.text(200, 50, '', {fontSize:'14px', fill:'#f1c40f', fontStyle:'bold'}).setOrigin(0.5).setDepth(101);

        setupTowers(self);
        for (let y = 0; y < 600; y += 25) {
            for (let x = 0; x < 400; x += 25) { this.add.rectangle(x+12.5, y+12.5, 25, 25, ((x+y)/25)%2===0 ? 0x638a4d : 0x739a5d); }
        }
        this.add.rectangle(200, 300, 400, 40, 0x3498db).setDepth(1); 
        this.add.rectangle(100, 300, 50, 60, 0x7d6752).setDepth(2); this.add.rectangle(300, 300, 50, 60, 0x7d6752).setDepth(2); 
        for(let i=0; i<4; i++) {
            this.add.rectangle(100, 277+i*15, 50, 2, 0x4a3c31).setDepth(3); this.add.rectangle(300, 277+i*15, 50, 2, 0x4a3c31).setDepth(3);
        }
        this.add.rectangle(200, 700, 400, 200, 0x2c3e50).setDepth(100);
        elixirText = this.add.text(140, 620, '💧 5', {fontSize:'28px', fill:'#3498db', fontStyle:'bold'}).setDepth(101);
        
        // ПАНЕЛЬ ЭМОЦИЙ
        let emoteBtn = self.add.circle(30, 450, 20, 0x34495e).setInteractive().setDepth(101);
        self.add.text(30, 450, '💬', {fontSize:'20px'}).setOrigin(0.5).setDepth(102);
        let emotePanel = self.add.container(200, 400).setDepth(150).setVisible(false);
        emotePanel.add(self.add.rectangle(0, 0, 300, 220, 0x000000, 0.9).setStrokeStyle(2, 0xffffff));
        let closeBtn = self.add.text(130, -95, 'X', {fontSize:'20px', fill:'#e74c3c'}).setInteractive().on('pointerdown', ()=>emotePanel.setVisible(false));
        emotePanel.add(closeBtn);
        emoteBtn.on('pointerdown', () => emotePanel.setVisible(!emotePanel.visible));
        
        let emotes = ['👍', '😂', '😭', '😠'];
        emotes.forEach((e, i) => {
            let b = self.add.rectangle(-90 + i*60, -50, 50, 50, 0xffffff, 0.1).setInteractive();
            b.on('pointerdown', () => { push(eventsRef, {type:'chat', side:playerRole, msg:e}); emotePanel.setVisible(false); });
            emotePanel.add([b, self.add.text(-90 + i*60, -50, e, {fontSize:'25px'}).setOrigin(0.5)]);
        });
        
        let phrases = ["Удачи!", "Пошел ты нахуй пидор блять", "Ух ты!", "Спасибо!", "Хорошая игра!", "Ой..."];
        phrases.forEach((p, i) => {
            let px = (i%2===0) ? -70 : 70; let py = 10 + Math.floor(i/2)*35;
            let b = self.add.rectangle(px, py, 130, 28, 0x34495e).setInteractive();
            b.on('pointerdown', () => { push(eventsRef, {type:'chat', side:playerRole, msg:p}); emotePanel.setVisible(false); });
            emotePanel.add([b, self.add.text(px, py, p, {fontSize:'12px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5)]);
        });

        self.renderHand = () => {
            self.uiElements.forEach(e => e.destroy()); self.uiElements = [];
            self.handIds.forEach((id, i) => {
                let cData = window.allCardsData.find(c => c.id === id);
                let btn = self.add.rectangle(100+i*90, 720, 80, 100, cData.color).setInteractive().setDepth(101);
                let txt1 = self.add.text(100+i*90, 680, cData.id.toUpperCase(), {fontSize:'10px', fill:'#000', fontStyle:'bold'}).setOrigin(0.5).setDepth(102);
                let txt2 = self.add.text(100+i*90, 740, "💧"+cData.c, {fontSize:'14px', fill:'#fff', fontStyle:'bold'}).setOrigin(0.5).setDepth(102);
                btn.on('pointerdown', () => { 
                    if (gameState.tiebreakerStarted) return; 
                    selectedCardObj = { data: cData, index: i }; self.uiElements.forEach(e => { if(e.type === 'Rectangle' && e.depth === 101) e.setStrokeStyle(0); }); btn.setStrokeStyle(4, 0xf1c40f); 
                });
                self.uiElements.push(btn, txt1, txt2);
            });
            let nextData = window.allCardsData.find(c => c.id === self.nextIds[0]);
            self.uiElements.push(self.add.rectangle(30, 720, 40, 50, nextData.color).setDepth(101), self.add.text(30, 720, "NEXT\n💧"+nextData.c, {fontSize:'9px', fill:'#fff', align:'center', fontStyle:'bold'}).setOrigin(0.5).setDepth(102));
        };
        self.renderHand();
        
        this.input.on('pointerdown', (p) => {
            if (!selectedCardObj || p.y > 600 || !playerRole || isGameOver || gameState.tiebreakerStarted) return;
            let cData = selectedCardObj.data; if (cData.id !== 'fireball' && cData.id !== 'arrows' && cData.id !== 'log' && p.y < 350) return; 
            if (elixir >= cData.c) {
                elixir -= cData.c; let tx = isHost ? p.x : 400 - p.x; let ty = isHost ? p.y : 600 - p.y; let spread = 35; 
                
                if (cData.id === 'archers') { push(unitsRef, {x:tx-spread, y:ty, type:'archer', owner:playerRole, lane:(tx-spread<200?'left':'right')}); push(unitsRef, {x:tx+spread, y:ty, type:'archer', owner:playerRole, lane:(tx+spread<200?'left':'right')}); }
                else if (cData.id === 'goblins') { push(unitsRef, {x:tx-spread, y:ty-15, type:'goblin', owner:playerRole, lane:(tx-spread<200?'left':'right')}); push(unitsRef, {x:tx+spread, y:ty-15, type:'goblin', owner:playerRole, lane:(tx+spread<200?'left':'right')}); push(unitsRef, {x:tx, y:ty+15, type:'goblin', owner:playerRole, lane:(tx<200?'left':'right')}); }
                else if (cData.id === 'minions') { push(unitsRef, {x:tx-spread, y:ty-15, type:'minion', owner:playerRole, lane:(tx-spread<200?'left':'right')}); push(unitsRef, {x:tx+spread, y:ty-15, type:'minion', owner:playerRole, lane:(tx+spread<200?'left':'right')}); push(unitsRef, {x:tx, y:ty+15, type:'minion', owner:playerRole, lane:(tx<200?'left':'right')}); }
                else if (cData.id === 'skeletons') { for(let k=0; k<4; k++) { let sx = tx+(k%2===0?-spread:spread); let sy=ty+(k<2?-15:15); push(unitsRef, {x:sx, y:sy, type:'skeleton', owner:playerRole, lane:(sx<200?'left':'right')}); } }
                else push(unitsRef, {x:tx, y:ty, type:cData.id, owner:playerRole, lane:(tx<200?'left':'right')});
                
                let playedId = self.handIds[selectedCardObj.index]; self.handIds[selectedCardObj.index] = self.nextIds.shift(); self.nextIds.push(playedId);
                selectedCardObj = null; self.renderHand();
            }
        });
        
        onChildAdded(unitsRef, (snapshot) => { handleSpawn(self, snapshot.val(), snapshot.key); });
        onChildRemoved(unitsRef, (snapshot) => { if (unitsMap[snapshot.key]) destroyUnit(snapshot.key); });
        onChildChanged(unitsRef, (snapshot) => {
            let id = snapshot.key; let data = snapshot.val();
            if (unitsMap[id] && !isHost && data.hp !== undefined) { unitsMap[id].setData('hp', data.hp); if(data.hp <= 0) destroyUnit(id); }
        });
        if (!isHost) {
            onValue(towersRef, (snapshot) => {
                const data = snapshot.val(); if (data) towerGroup.children.entries.forEach(t => {
                    let tid = t.getData('id'); if (data[tid] && data[tid].hp !== undefined) {
                        let hp = data[tid].hp; t.setData('hp', hp);
                        if(t.getData('bar')) t.getData('bar').width = (hp/t.getData('maxHp'))*(t.getData('isM')?60:40);
                        if (hp <= 0 && t.active) destroyTower(self, t);
                        
                        // Активация пушки у клиента если ХП упало
                        if (t.getData('isM') && !t.getData('isA') && hp < t.getData('maxHp')) {
                            t.setData('isA', true); if(t.getData('weapon')) t.getData('weapon').setVisible(true);
                        }
                    }
                });
            });
        }
        onChildAdded(eventsRef, (snapshot) => { 
            let ev = snapshot.val(); 
            if(ev.type === 'spell_boom') doSpellBoom(self, ev.x, ev.y, ev.owner, ev.spellId);
            if(ev.type === 'logRoll') doLogRoll(self, ev.x, ev.y, ev.owner, snapshot.key);
            if(ev.type === 'chat') {
                let isMeChat = ev.side === playerRole;
                let bubble = self.add.container(isMeChat ? 270 : 130, isMeChat ? 480 : 120).setDepth(200);
                bubble.add(self.add.rectangle(0, 0, 140, 40, 0xffffff).setStrokeStyle(2, 0x000));
                bubble.add(self.add.text(0, 0, ev.msg, {fontSize: ev.msg.length>2?'12px':'25px', fill:'#000', align:'center', wordWrap:{width:130}}).setOrigin(0.5));
                self.time.delayedCall(2500, () => bubble.destroy());
            }
        });
    },
    update: function(time) {
        if (isGameOver || !playerRole || !gameState.startTime) return; 
        
        let elapsed = (Date.now() - gameState.startTime) / 1000;
        let remaining = 180 - elapsed; let mult = 1;

        if (elapsed < 120) { phaseText.setText(''); }
        else if (elapsed >= 120 && elapsed < 180) { phaseText.setText('x2 ELIXIR'); mult = 2; }
        else if (elapsed >= 180) {
            if (isHost && !gameState.overtimeDecided) {
                let meT = 0, enT = 0;
                towerGroup.children.entries.forEach(t => { if(t.active) { if(t.getData('side') === 'me') meT++; else enT++; } });
                if (meT === enT) dbUpdate(ref(db, `${gamePath}/state`), { overtimeDecided: true, isOvertime: true });
                else dbUpdate(ref(db, `${gamePath}/state`), { overtimeDecided: true, isOvertime: false, endWinner: meT > enT ? 'me' : 'enemy' });
            }
            if (gameState.overtimeDecided) {
                if (!gameState.isOvertime) {
                    isGameOver = true; let iWon = (gameState.endWinner === playerRole);
                    this.add.text(60, 300, iWon ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ!', {fontSize:'45px', fill: iWon?'#f1c40f':'#e74c3c', fontStyle:'bold'}).setDepth(200); return;
                }
                remaining = 240 - elapsed;
                if (remaining > 0) { phaseText.setText('BONUS TIME!\nx3 ELIXIR'); mult = 3; } 
                else {
                    remaining = 0; phaseText.setText('TIEBREAKER!\nSUDDEN DEATH'); mult = 0;
                    if (isHost && !gameState.tiebreakerStarted) dbUpdate(ref(db, `${gamePath}/state`), { tiebreakerStarted: true });
                }
            }
        }
        
        let disp = Math.max(0, Math.floor(remaining));
        timerText.setText(Math.floor(disp/60) + ':' + (disp%60<10?'0':'') + disp%60);
        if (!gameState.tiebreakerStarted && elixir < 10) elixir += 0.0035 * mult;
        elixirText.setText('💧 ' + Math.floor(elixir));

        projectiles.children.entries.forEach(p => {
            let target = p.getData('target'); if (!target || !target.active) { p.destroy(); return; }
            if (Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y) < 15) {
                if (isHost) target.getData('isT') ? updateTowerHP(this, target, p.getData('dmg')) : applyUnitDmg(target, p.getData('dmg'), p.getData('dbKey'));
                p.destroy();
            } else { let angle = Phaser.Math.Angle.Between(p.x, p.y, target.x, target.y); p.x += Math.cos(angle)*10; p.y += Math.sin(angle)*10; p.rotation=angle; }
        });
        hpBarsGroup.children.entries.forEach(bar => {
            let owner = bar.getData('owner'); if (!owner || !owner.active) bar.destroy();
            else { bar.setPosition(owner.x, owner.y-20); bar.width = Math.max(0, (owner.getData('hp')/owner.getData('maxHp'))*25); }
        });

        if (time > lastLogic + 100) {
            lastLogic = time; 
            
            if (gameState.tiebreakerStarted && isHost) {
                Object.keys(unitsMap).forEach(k => applyUnitDmg(unitsMap[k], 9999, k)); 
                towerGroup.children.entries.forEach(t => { if(t.active) updateTowerHP(this, t, 15); }); 
                return; 
            }

            Object.keys(unitsMap).forEach(id => {
                let u = unitsMap[id]; if (!u || !u.active) return;
                let type = u.getData('type'); let side = u.getData('owner'); let target = u.getData('lockedTarget');
                let range = type === 'archer' ? 140 : 65; 
                
                if (type === 'prince') {
                    if (!u.getData('isMoving') || (target && target.active && Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y) <= range)) {
                        u.setData('chargeTime', 0);
                        if (u.getData('inCharge')) { u.setData('inCharge', false); u.setData('spd', u.getData('baseSpd')); if(u.getData('cFX')) u.getData('cFX').destroy(); }
                    } else {
                        let ct = (u.getData('chargeTime') || 0) + 100; u.setData('chargeTime', ct);
                        if (ct >= 3000 && !u.getData('inCharge')) {
                            u.setData('inCharge', true); u.setData('spd', u.getData('baseSpd') * 2); 
                            let f = this.add.circle(0, 0, 15, 0xe74c3c, 0.5); u.add(f); u.setData('cFX', f);
                        }
                    }
                }
                if (time > (u.getData('lastDecay') || 0) + 1000 && u.getData('isB') && isHost) { u.setData('lastDecay', time); applyUnitDmg(u, 13.5, id); }
                
                let possibleTargets = [...towerGroup.children.entries.filter(t => t.getData('side') !== side && t.active)];
                if (type !== 'giant') possibleTargets = possibleTargets.concat(Object.values(unitsMap).filter(eu => eu.active && eu.getData('owner') !== side && !eu.getData('isB') && (!eu.getData('isFlying') || type === 'archer'))).concat(Object.values(unitsMap).filter(b => b.getData('isB') && b.getData('owner') !== side && b.active));
                
                // Умный кайтинг
                let distT = target && target.active ? Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y) : 9999;
                let isAttacking = distT <= range && !u.getData('isB');
                
                if (!isAttacking) {
                    let newTarget = this.physics.closest(u, possibleTargets);
                    if (newTarget) {
                        target = newTarget; u.setData('lockedTarget', target);
                        distT = Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y);
                    }
                }

                if (target && target.active && !u.getData('isB')) {
                    if (distT <= range) {
                        u.body.setVelocity(0); u.setData('isMoving', false);
                        
                        // ПОВОРОТ К ВРАГУ ПРИ АТАКЕ
                        u.rotation = Phaser.Math.Angle.Between(u.x, u.y, target.x, target.y) + Math.PI/2;
                        
                        if (time > (u.getData('lastAtk') || 0) + u.getData('atkSpd')) {
                            u.setData('lastAtk', time); let dmg = u.getData('pwr');
                            if (type === 'prince' && u.getData('inCharge')) { dmg *= 2; u.setData('chargeTime', 0); u.setData('inCharge', false); u.setData('spd', u.getData('baseSpd')); if(u.getData('cFX')) u.getData('cFX').destroy(); }
                            if (type === 'archer') launchProj(this, u, target, dmg, 'arrow', target.getData('dbKey'));
                            else if (isHost) target.getData('isT') ? updateTowerHP(this, target, dmg) : applyUnitDmg(target, dmg, target.getData('dbKey'));
                        }
                    } else { 
                        let destX = target.x, destY = target.y;
                        if (!u.getData('isFlying')) {
                            let isLocalVisual = (side === playerRole); 
                            let targetIsAcross = (u.y < 280 && target.y > 320) || (u.y > 320 && target.y < 280);
                            
                            if (targetIsAcross) {
                                let absBX = (u.getData('lane') === 'left') ? 100 : 300;
                                destX = isHost ? absBX : 400 - absBX; 
                                destY = (u.y < 280) ? 340 : 260; 
                            }
                        }
                        this.physics.moveTo(u, destX, destY, u.getData('spd'));
                        // ПОВОРОТ ПРИ ДВИЖЕНИИ
                        u.rotation = Phaser.Math.Angle.Between(u.x, u.y, destX, destY) + Math.PI/2;
                        u.setData('isMoving', true); 
                    }
                } else if (u.getData('isB') && target && target.active && distT < 180 && !target.getData('isFlying')) {
                    if (u.getData('weapon')) u.getData('weapon').rotation = Phaser.Math.Angle.Between(u.x, u.y, target.x, target.y) + Math.PI/2;
                    if (time > (u.getData('lastAtk') || 0) + u.getData('atkSpd')) { u.setData('lastAtk', time); launchProj(this, u, target, u.getData('pwr'), 'ball', target.getData('dbKey')); }
                }
            });
            
            towerGroup.children.entries.forEach(t => {
                if (!t.active) return;
                
                // АКТИВАЦИЯ КОРОЛЯ (АГРО И ВЫЕЗД ПУШКИ)
                if (t.getData('isM') && !t.getData('isA') && t.getData('hp') < t.getData('maxHp')) {
                    t.setData('isA', true); if(t.getData('weapon')) t.getData('weapon').setVisible(true);
                }
                
                if (!t.getData('isA')) return;
                
                let enemies = Object.values(unitsMap).filter(u => u.active && u.getData('owner') !== t.getData('side'));
                let closest = this.physics.closest(t, enemies);
                if (closest && Phaser.Math.Distance.Between(t.x, t.y, closest.x, closest.y) < (t.getData('isM')?160:185)) {
                    // ПОВОРОТ ОРУЖИЯ БАШЕН
                    if (t.getData('weapon')) t.getData('weapon').rotation = Phaser.Math.Angle.Between(t.x, t.y, closest.x, closest.y) + Math.PI/2;
                    if (time > t.getData('lastS') + 1000) { t.setData('lastS', time); launchProj(this, t, closest, t.getData('isM')?55:42, t.getData('isM')?'ball':'arrow', closest.getData('dbKey')); }
                }
            });
        }
    }
};
function handleSpawn(scene, data, key) {
    let tx = isHost ? data.x : 400 - data.x; let ty = isHost ? data.y : 600 - data.y;
    
    if (data.type === 'fireball') {
        let spr = scene.add.circle(tx, (data.owner===playerRole ? 850 : -50), 15, 0xe67e22).setDepth(60);
        scene.tweens.add({ targets: spr, x: tx, y: ty, duration: 1500, 
            onUpdate: () => {
                let sz = Math.random()*6+4;
                let p = scene.add.rectangle(spr.x+(Math.random()-0.5)*20, spr.y+(Math.random()-0.5)*20, sz, sz, Math.random()>0.5?0xf1c40f:0xe74c3c).setDepth(59);
                scene.tweens.add({targets: p, alpha: 0, scale: 0.1, duration: 500, onComplete: () => p.destroy()});
            },
            onComplete: () => { spr.destroy(); if (isHost) { push(eventsRef, { type: 'spell_boom', x: data.x, y: data.y, owner: data.owner, spellId: data.type }); remove(ref(db, `${gamePath}/units/${key}`)); } }
        }); return;
    }
    
    if (data.type === 'arrows') {
        let spr = scene.add.container(tx, (data.owner===playerRole ? 850 : -50)).setDepth(60);
        for(let i=0; i<15; i++) { spr.add(scene.add.rectangle((Math.random()-0.5)*70, (Math.random()-0.5)*70, 2, 20, 0x5d4037)); }
        scene.tweens.add({ targets: spr, x: tx, y: ty, duration: 800, 
            onComplete: () => { scene.time.delayedCall(50, () => { spr.destroy(); }); if (isHost) { push(eventsRef, { type: 'spell_boom', x: data.x, y: data.y, owner: data.owner, spellId: data.type }); remove(ref(db, `${gamePath}/units/${key}`)); } }
        }); return;
    }
    
    if (data.type === 'log' && isHost) { push(eventsRef, { type: 'logRoll', x: data.x, y: data.y, owner: data.owner }); remove(ref(db, `${gamePath}/units/${key}`)); return; }
    
    let cfgs = { knight:{s:20, p:40, h:450, sz:22, a:1200}, giant:{s:13, p:100, h:860, sz:30, a:2000}, archer:{s:17, p:30, h:160, sz:16, a:1200}, goblin:{s:30, p:20, h:90, sz:14, a:1000}, minipekka:{s:35, p:260, h:380, sz:20, a:2000}, cannon:{s:0, p:38, h:400, sz:30, isB: true, a:3000}, minion:{s:25, p:40, h:90, sz:14, a:1000, isFlying: true}, skeleton:{s:25, p:10, h:1, sz:10, a:1000}, prince:{s:22, p:230, h:450, sz:22, a:2000} };
    let c = cfgs[data.type]; if (isHost && data.hp === undefined) dbUpdate(ref(db, `${gamePath}/units/${key}`), { hp: c.h }); createU(scene, tx, ty, data.owner, c, data.type, key, data.lane);
}

function doSpellBoom(scene, x, y, owner, type) {
    let tx = isHost ? x : 400 - x, ty = isHost ? y : 600 - y; let isFB = type === 'fireball'; let rad = isFB ? 60 : 80;
    
    if (isFB) {
        let f = scene.add.circle(tx, ty, rad, 0xe67e22, 0.6).setDepth(50);
        scene.time.delayedCall(300, () => { if(f) f.destroy(); });
    } else {
        let a = scene.add.circle(tx, ty, rad, 0xe74c3c, 0.4).setDepth(50);
        scene.time.delayedCall(100, () => { if(a) a.destroy(); }); 
    }

    if (isHost) {
        let tDmg = isFB ? 200 : 65; let uDmg = isFB ? 150 : 160; 
        towerGroup.children.entries.forEach(t => { if (t.active && Phaser.Math.Distance.Between(tx, ty, t.x, t.y) < rad+20 && t.getData('side') !== owner) updateTowerHP(scene, t, tDmg); });
        Object.values(unitsMap).forEach(u => { if (u.active && Phaser.Math.Distance.Between(tx, ty, u.x, u.y) < rad && u.getData('owner') !== owner) applyUnitDmg(u, uDmg, u.getData('dbKey')); });
    }
}

function doLogRoll(scene, x, y, owner, key) {
    let tx = isHost ? x : 400 - x, ty = isHost ? y : 600 - y; let logSpr = scene.add.container(tx, ty).setDepth(45);
    logSpr.add([scene.add.rectangle(0, 0, 70, 20, 0xd35400), scene.add.rectangle(-20, 0, 4, 24, 0x7f8c8d), scene.add.rectangle(0, 0, 4, 24, 0x7f8c8d), scene.add.rectangle(20, 0, 4, 24, 0x7f8c8d)]);
    let hitSet = new Set();
    scene.tweens.add({ targets: logSpr, y: ty+(owner===playerRole ? -280 : 280), duration: 1500,
        onUpdate: () => { if (isHost) {
            Object.keys(unitsMap).forEach(k => { let u = unitsMap[k]; if (u.active && u.getData('owner') !== owner && !u.getData('isB') && !u.getData('isFlying') && !hitSet.has(k) && Math.abs(logSpr.x-u.x) < 50 && Math.abs(logSpr.y-u.y) < 30) { applyUnitDmg(u, 100, k); hitSet.add(k); } });
            towerGroup.children.entries.forEach(t => { if (t.active && t.getData('side') !== owner && !hitSet.has(t.getData('id')) && Math.abs(logSpr.x-t.x) < 60 && Math.abs(logSpr.y-t.y) < 40) { updateTowerHP(scene, t, 39); hitSet.add(t.getData('id')); } });
        } }, onComplete: () => { logSpr.destroy(); if(isHost) remove(ref(db, `${gamePath}/events/${key}`)); }
    });
}

function createU(scene, x, y, owner, c, type, key, lane) {
    let isMe = owner === playerRole; let u = scene.add.container(x, y).setDepth(c.isFlying?20:15); scene.physics.add.existing(u); u.body.setSize(c.sz, c.sz).setOffset(-c.sz/2, -c.sz/2); 
    
    // ВАЖНО: Рисуем все юниты лицом ВВЕРХ (угол 0 в Phaser)
    let dirY = -1; 
    
    if (type === 'cannon') {
        u.add(scene.add.rectangle(0, 0, c.sz, c.sz, 0x6e4b30)); // Неподвижная база
        let gunGrp = scene.add.container(0,0);
        gunGrp.add(scene.add.circle(0, 0, 8, 0x7f8c8d)); 
        gunGrp.add(scene.add.rectangle(0, dirY*10, 6, 20, 0x7f8c8d)); 
        u.add(gunGrp); u.setData('weapon', gunGrp);
    }
    else if (type === 'skeleton') u.add(scene.add.rectangle(0, 0, c.sz, c.sz, 0xffffff));
    else if (type === 'prince') {
        let col = isMe?0x2980b9:0xc0392b;
        u.add(scene.add.rectangle(0, dirY*5, 18, 35, 0x6e4b30)); 
        u.add(scene.add.rectangle(0, dirY*25, 10, 16, 0x4a321f)); 
        u.add(scene.add.rectangle(0, 0, c.sz, c.sz, col)); 
        u.add(scene.add.rectangle(14, dirY*15, 4, 40, 0x7f8c8d)); 
    } else if (type === 'giant') {
        u.add(scene.add.rectangle(0, 0, 30, 30, 0xffcc99));
        u.add(scene.add.rectangle(0, 0, 24, 30, 0x8b4513));
        u.add(scene.add.rectangle(0, dirY*8, 14, 14, 0xffcc99));
    } else if (type === 'archer') {
        u.add(scene.add.circle(0, 0, 8, 0xe84393)); 
    } else if (type === 'minipekka') { 
        u.add(scene.add.rectangle(0, 0, c.sz, c.sz, 0x34495e)); 
        u.add(scene.add.rectangle(c.sz/2+4, dirY*6, 6, 22, 0x2980b9)); 
        u.add(scene.add.rectangle(0, dirY*2, 10, 4, 0x00ffff)); 
    } else if (type === 'knight') {
        u.add(scene.add.rectangle(0, 0, c.sz, c.sz, 0x95a5a6)); 
        u.add(scene.add.rectangle(0, 0, c.sz-8, c.sz-8, 0x7f8c8d)); 
        u.add(scene.add.rectangle(0, dirY*(c.sz/2-4), 10, 4, 0xffcc99)); 
        u.add(scene.add.rectangle(c.sz/2+4, 0, 6, 6, 0xecf0f1)); 
    } else {
        let col = isMe?0x2980b9:0xc0392b; let body = scene.add.rectangle(0, 0, c.sz, c.sz, col); u.add(body);
        if (type === 'goblin') { body.setFillStyle(0x1abc9c); u.add(scene.add.rectangle(c.sz/2+2, dirY*4, 2, 10, 0xecf0f1)); }
        else if (type === 'minion') u.add([scene.add.rectangle(-8, dirY*2, 8, 12, 0x8e44ad), scene.add.rectangle(8, dirY*2, 8, 12, 0x8e44ad)]);
    }

    // Исходный поворот: свои смотрят вверх (0), враги вниз (PI)
    u.rotation = isMe ? 0 : Math.PI;

    u.setData({spd:c.s, baseSpd:c.s, pwr:c.p, type:type, owner:owner, lane:lane, hp:c.h, maxHp:c.h, dbKey:key, isB:!!c.isB, atkSpd:c.a, isFlying:!!c.isFlying, chargeTime:0, inCharge:false, isMoving:false});
    
    let barCol = isMe ? 0x2ecc71 : 0xe74c3c;
    hpBarsGroup.add(scene.add.rectangle(x, y-20, 25, 3, barCol).setDepth(21).setData('owner', u)); 
    unitsMap[key] = u;
}

function destroyUnit(id) { if (unitsMap[id]) { let hpB = unitsMap[id].getData('hpBar'); if(hpB) hpB.destroy(); let cFX = unitsMap[id].getData('cFX'); if(cFX) cFX.destroy(); unitsMap[id].destroy(); delete unitsMap[id]; } }
function destroyTower(scene, t) { 
    if (!t.active) return; 
    
    // АКТИВАЦИЯ КОРОЛЯ ПРИ ПАДЕНИИ БАШНИ ЛУЧНИЦ
    if (!t.getData('isM')) { 
        let k = towerGroup.children.entries.find(it => it.getData('isM') && it.getData('side') === t.getData('side')); 
        if(k) {k.setData('isA', true); if(k.getData('weapon')) k.getData('weapon').setVisible(true);} 
    } 
    
    if (t.getData('isM') || gameState.isOvertime || gameState.tiebreakerStarted) {
        isGameOver = true; let iWon = t.getData('side') !== playerRole;
        scene.add.text(60, 300, iWon ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ!', {fontSize:'45px', fill: iWon?'#f1c40f':'#e74c3c', fontStyle:'bold'}).setDepth(200); 
    }
    let bg = t.getData('bg'); if(bg) bg.destroy(); let bar = t.getData('bar'); if(bar) bar.destroy(); t.destroy(); 
}

function setupTowers(scene) { 
    towerGroup.clear(true, true); 
    const ts = [{id:'eL', x:100, y:100, s:'enemy', m:false, l:'left'}, {id:'eR', x:300, y:100, s:'enemy', m:false, l:'right'}, {id:'eM', x:200, y:50, s:'enemy', m:true, l:'mid'}, {id:'mL', x:100, y:500, s:'me', m:false, l:'left'}, {id:'mR', x:300, y:500, s:'me', m:false, l:'right'}, {id:'mM', x:200, y:550, s:'me', m:true, l:'mid'}];
    ts.forEach(d => { 
        let tx = isHost?d.x:400-d.x, ty = isHost?d.y:600-d.y; 
        let isMe = d.s === playerRole; let col = isMe?0x2980b9:0xc0392b; 
        let w = d.m?50:40; let t = scene.add.container(tx, ty).setDepth(5); 
        scene.physics.add.existing(t, true); t.body.setSize(w, w).setOffset(-w/2, -w/2); 
        
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
            kingCannon.setVisible(false); // ПУШКА СПРЯТАНА ДО АКТИВАЦИИ
            t.add(kingCannon); t.setData('weapon', kingCannon);
        } else {
            t.add(scene.add.rectangle(0, -dirY * (w/2 - 4), 20, 8, col)); 
            t.add(scene.add.circle(0, 0, 8, 0xe84393)); 
            let bow = scene.add.rectangle(0, dirY * 12, 16, 3, 0x8b4513);
            t.add(bow); t.setData('weapon', bow);
        }

        towerGroup.add(t); 
        let barCol = isMe ? 0x2ecc71 : 0xe74c3c; 
        t.setData({id:d.id, hp:d.m?2500:1300, maxHp:d.m?2500:1300, side:d.s, isM:d.m, isA:!d.m, lane:d.l, isT:true, lastS:0, bar: scene.add.rectangle(tx, ty-35, d.m?60:40, 6, barCol).setDepth(11), bg: scene.add.rectangle(tx, ty-35, d.m?60:40, 6, 0x333333).setDepth(10)}); 
    });
    if (isHost) ts.forEach(d => { dbUpdate(ref(db, `${gamePath}/towers/${d.id}`), { hp: d.m?2500:1300 }); }); 
}

function launchProj(scene, s, target, dmg, type, key) { let p = type==='arrow'?scene.add.rectangle(s.x, s.y, 10, 2, 0x5d4037):scene.add.circle(s.x, s.y, 8, 0x2c3e50); projectiles.add(p.setDepth(40).setData({target:target, dmg:dmg, dbKey:key})); }
function applyUnitDmg(u, d, key) { if (!isHost || !u || !u.active || !u.scene) return; let actualKey = key || u.getData('dbKey'); if (!actualKey) return; let hp = Math.max(0, (u.getData('hp')||0) - d); u.setData('hp', hp); if (hp <= 0) { remove(ref(db, `${gamePath}/units/${actualKey}`)); destroyUnit(actualKey); } else { dbUpdate(ref(db, `${gamePath}/units/${actualKey}`), { hp: hp }); } }
function updateTowerHP(scene, t, d) { if (!isHost || !t || !t.active || !t.scene) return; let hp = Math.max(0, (t.getData('hp')||0) - d); t.setData('hp', hp); if (hp <= 0) { remove(ref(db, `${gamePath}/towers/${t.getData('id')}`)); destroyTower(scene, t); } else { dbUpdate(ref(db, `${gamePath}/towers/${t.getData('id')}`), { hp: hp }); if(t.getData('bar')) t.getData('bar').width = (hp/t.getData('maxHp'))*(t.getData('isM')?60:40); } }

const gameConfig = Object.assign({}, config, { scene: [MenuScene, GameScene] }); const phaserGame = new Phaser.Game(gameConfig);