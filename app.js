// ════════════════════════════════════════
// PALMA API INTEGRATION (Lua ↔ UI bridge)
// ════════════════════════════════════════
const PALMA_SECRET = "PALMAAAAAAAAAAAAA2.666666666666";
const PALMA_API_BASE = "http://localhost:5000";
const PALMA_API_KEY = "oXstp8j6obMMQ2owaHI48UraSBKc4OFg";
let PALMA_AUTH_KEY = "7499527184034711224"; // Default auth key, updated by Lua
let _nuiEndpoint = null; // Set by Lua via "send-endpoint" message

// Encryption helpers
function xorStr(str, key) {
    let out = "";
    for (let i = 0; i < str.length; i++) {
        out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return out;
}
function rot(str, shift = 3) {
    let out = "";
    for (let c of str) {
        let v = c.charCodeAt(0);
        out += String.fromCharCode(((v << shift) & 0xff) | ((v >> (8 - shift)) & 0xff));
    }
    return out;
}
function unrot(str, shift = 3) {
    let out = "";
    for (let c of str) {
        let v = c.charCodeAt(0);
        out += String.fromCharCode(((v >> shift) | ((v << (8 - shift)) & 0xff)) & 0xff);
    }
    return out;
}
function b64Encode(str) {
    // Convert binary string to base64
    let bin = '';
    for (let i = 0; i < str.length; i++) bin += str[i];
    return btoa(bin);
}
function b64Decode(str) {
    return atob(str);
}
function encryptPayload(obj) {
    const jsonStr = JSON.stringify(obj);
    const step1 = xorStr(jsonStr, PALMA_SECRET);
    const step2 = rot(step1, 3);
    return b64Encode(step2);
}
function decryptResponse(enc) {
    try {
        const step1 = b64Decode(enc);
        const step2 = unrot(step1, 3);
        const plain = xorStr(step2, PALMA_SECRET);
        return JSON.parse(plain);
    } catch (e) {
        console.error("Decrypt error:", e);
        return null;
    }
}

// Send NUI callback to Lua (via injected resource endpoint)
function sendToLua(data) {
    if (!_nuiEndpoint) return;
    fetch(_nuiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).catch(() => {});
}

// Listen for DUI messages from Lua
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.action) return;

    switch (msg.action) {
        case 'keyboard':
            handleLuaKeyboard(msg.key, msg.value, msg.keyType);
            break;
        case 'show-notification':
            showNotification(msg.type || 'info', msg.title || 'Palma', msg.message || '', msg.duration || 3000);
            break;
        case 'send-endpoint':
            _nuiEndpoint = msg.value;
            break;
        case 'set-auth-key':
            PALMA_AUTH_KEY = msg.value;
            break;
        case 'user-info-encrypted':
            handleUserInfo(msg.data);
            break;
        case 'load-configs':
            handleLoadConfigs(msg.data);
            break;
        case 'load-scripts':
            handleLoadScripts(msg.data);
            break;
    }
});

// Handle keyboard events from Lua (virtual key codes mapped to key names)
function handleLuaKeyboard(key, value, keyType) {
    // Simulate a keydown event that the existing keyboard handler can process
    const keyMapping = {
        'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
        'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
        'Enter': 'Enter', 'Backspace': 'Backspace', 'Delete': 'Delete',
        'Escape': 'Escape', 'A': 'a', 'E': 'e', 'Space': ' '
    };
    const mappedKey = keyMapping[key] || key;
    const evt = new KeyboardEvent('keydown', { key: mappedKey, bubbles: true });
    document.dispatchEvent(evt);
}

// Handle user info from API (decrypted)
function handleUserInfo(encryptedData) {
    const data = decryptResponse(encryptedData);
    if (!data || !data.success) return;
    // Update user bubble
    const bubbleName = document.querySelector('.user-bubble-name');
    const bubbleUuid = document.querySelector('.user-bubble-uuid');
    const bubbleAvatar = document.querySelector('.user-bubble-avatar');
    if (bubbleName) bubbleName.textContent = data.username || 'User';
    if (bubbleUuid) bubbleUuid.textContent = data.uuid || '0000';
    if (bubbleAvatar && data.avatar) bubbleAvatar.src = data.avatar;

    // Update init screen
    const initUsername = document.getElementById('initUsername');
    const initUserUuid = document.getElementById('initUserUuid');
    const initUserLogo = document.getElementById('initUserLogo');
    if (initUsername) initUsername.textContent = data.username || 'User';
    if (initUserUuid) initUserUuid.textContent = data.uuid || '0000';
    if (initUserLogo && data.avatar) initUserLogo.src = data.avatar;
}

// Handle configs loaded from API
let _loadedConfigs = [];
function handleLoadConfigs(rawData) {
    try {
        const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (parsed && parsed.success && parsed.configs) {
            _loadedConfigs = parsed.configs;
            updateConfigMenu();
        }
    } catch (e) { console.error("Config parse error:", e); }
}

// Handle scripts loaded from API
let _loadedScripts = [];
function handleLoadScripts(rawData) {
    try {
        const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (parsed && parsed.success && parsed.scripts) {
            _loadedScripts = parsed.scripts;
            updateScriptsMenu();
        }
    } catch (e) { console.error("Scripts parse error:", e); }
}

// Update Config category in Settings with loaded configs
function updateConfigMenu() {
    const configCat = menuData.settings.categories.find(c => c.label === 'Config');
    if (!configCat) return;
    
    // Filter out previous API items and dividers to prevent duplication
    configCat.tabs = configCat.tabs.filter(t => !t._fromApi && t.label !== "Saved Configs");
    
    const apiItems = _loadedConfigs.map(cfg => ({
        type: "button",
        label: cfg.name,
        desc: `Config by ${cfg.publisher || 'Unknown'} · ${cfg.is_public ? 'Public' : 'Private'}`,
        _fromApi: true,
        _configId: cfg.id,
        _configContent: cfg.content
    }));

    if (apiItems.length > 0) {
        configCat.tabs.push({ type: "divider", label: "Saved Configs", _fromApi: true });
        configCat.tabs.push(...apiItems);
    }
    
    // Refresh state categories if we are in Settings section
    if (sectionKeys[state.sectionIndex] === 'settings') {
        state.categories = menuData.settings.categories;
        // If we are currently looking at the Config category, update items and render
        if (state.level === 2 && state.categories[state.categoryIndex].label === 'Config') {
            state.items = configCat.tabs;
            renderItems();
        } else if (state.level === 1) {
            // Re-render categories if visible
            renderCategories();
        }
    }
}

// Update Scripts category in Settings with loaded scripts
function updateScriptsMenu() {
    const scriptsCat = menuData.settings.categories.find(c => c.label === 'Scripts');
    if (!scriptsCat) return;

    // Filter out previous API items and dividers to prevent duplication
    scriptsCat.tabs = scriptsCat.tabs.filter(t => !t._fromApi && t.label !== "Saved Scripts");

    const scriptItems = _loadedScripts.map(s => ({
        type: "button",
        label: s.name,
        desc: `Script by ${s.publisher || 'Unknown'} · ${s.is_public ? 'Public' : 'Private'}`,
        _fromApi: true,
        _scriptId: s.id,
        _scriptContent: s.content
    }));

    if (scriptItems.length > 0) {
        scriptsCat.tabs.push({ type: "divider", label: "Saved Scripts", _fromApi: true });
        scriptsCat.tabs.push(...scriptItems);
    }

    // Refresh state categories if we are in Settings section
    if (sectionKeys[state.sectionIndex] === 'settings') {
        state.categories = menuData.settings.categories;
        // If we are currently looking at the Scripts category, update items and render
        if (state.level === 2 && state.categories[state.categoryIndex].label === 'Scripts') {
            state.items = scriptsCat.tabs;
            renderItems();
        } else if (state.level === 1) {
            // Re-render categories if visible
            renderCategories();
        }
    }
}

// ════════════════════════════════════════
// TEST PLAYER DATA
// ════════════════════════════════════════
const testPlayers = [
    { name: "xDarkSniper", id: 12, health: 100, armor: 50, ping: 34, distance: "120m", weapon: "Assault Rifle", vehicle: "Sultan RS", wanted: 0, cash: "$45,200" },
    { name: "NoobMaster69", id: 27, health: 75, armor: 0, ping: 88, distance: "340m", weapon: "Pistol", vehicle: "On Foot", wanted: 3, cash: "$12,800" },
    { name: "CJ_FromGrove", id: 3, health: 100, armor: 100, ping: 12, distance: "55m", weapon: "SMG", vehicle: "Infernus", wanted: 0, cash: "$1,250,000" },
    { name: "TurboKid_99", id: 45, health: 40, armor: 0, ping: 120, distance: "890m", weapon: "Unarmed", vehicle: "BMX", wanted: 1, cash: "$3,400" },
    { name: "SilentPhantom", id: 8, health: 100, armor: 80, ping: 22, distance: "200m", weapon: "Sniper Rifle", vehicle: "On Foot", wanted: 5, cash: "$89,000" },
    { name: "RacerX_Pro", id: 61, health: 90, armor: 30, ping: 55, distance: "1.2km", weapon: "Micro SMG", vehicle: "Zentorno", wanted: 0, cash: "$320,500" },
];

// ════════════════════════════════════════
// MENU DATA
// ════════════════════════════════════════
const menuData = {
    self: {
        icon: "fa-solid fa-user",
        categories: [
            { label: "Player", tabs: [
                { type: "slider", label: "Health", desc: "Set your current health points", value: 100, min: 0, max: 100 },
                { type: "slider", label: "Armour", desc: "Set your current armour level", value: 50, min: 0, max: 100 },
                { type: "checkbox", label: "God Mode", desc: "Become fully invincible to all damage", checked: false },
                { type: "checkbox", label: "Semi God Mode", desc: "Take damage but never die", checked: false },
                { type: "checkbox", label: "No Ragdoll", desc: "Disable ragdoll physics on your character", checked: false },
                { type: "checkbox", label: "Invisible", desc: "Make your character invisible to others", checked: false },
            ]},
            { label: "Movement", tabs: [
                { type: "slider", label: "Run Speed", desc: "Adjust your running speed multiplier", value: 1, min: 0.5, max: 5, step: 0.5 },
                { type: "slider", label: "Swim Speed", desc: "Adjust your swimming speed multiplier", value: 1, min: 0.5, max: 5, step: 0.5 },
                { type: "checkbox", label: "Unlimited Stamina", desc: "Never run out of stamina", checked: false },
                { type: "checkbox", label: "Super Jump", desc: "Jump much higher than normal", checked: false },
                { type: "checkbox", label: "Noclip", desc: "Fly through walls and objects freely", checked: false },
                { type: "checkbox", label: "Freeze Position", desc: "Lock your character in place", checked: false },
            ]},
            { label: "Appearance", tabs: [
                { type: "scrollable", label: "Outfit", desc: "Change your character outfit preset", value: 1, values: ["Default", "Casual", "Formal", "Sport"] },
                { type: "button", label: "Skin Editor", desc: "Open the character skin customization editor" },
                { type: "divider", label: "Accessories" },
                { type: "scrollable", label: "Hat", desc: "Select a hat accessory", value: 1, values: ["None", "Cap", "Beanie", "Helmet"] },
                { type: "scrollable", label: "Glasses", desc: "Select eyewear accessory", value: 1, values: ["None", "Sunglasses", "Aviators"] },
                { type: "scrollable", label: "Mask", desc: "Select a mask accessory", value: 1, values: ["None", "Skull", "Gas Mask", "Hockey"] },
            ]}
        ]
    },
    players: {
        icon: "fa-solid fa-users",
        categories: [
            { label: "List", isPlayerList: true, tabs: testPlayers.map(p => ({ type: "button", label: p.name, desc: `ID: ${p.id} · ${p.distance} away · ${p.vehicle}`, playerData: p })) },
            { label: "Interactions", tabs: [
                { type: "button", label: "Spectate", desc: "Watch the selected player" },
                { type: "button", label: "Teleport To", desc: "Teleport to the selected player's location" },
                { type: "button", label: "Copy Coords", desc: "Copy the player's coordinates to clipboard" },
                { type: "divider", label: "Actions" },
                { type: "button", label: "Send Message", desc: "Send a direct message to the player" },
                { type: "button", label: "Add Friend", desc: "Send a friend request to the player" },
                { type: "button", label: "Report", desc: "Report the player for rule violations" },
            ]},
            { label: "Vehicles", tabs: [
                { type: "button", label: "Steal Vehicle", desc: "Take control of the player's vehicle" },
                { type: "button", label: "Delete Vehicle", desc: "Remove the player's current vehicle" },
                { type: "button", label: "Enter as Passenger", desc: "Enter the player's vehicle as a passenger" },
                { type: "checkbox", label: "Vehicle Lock Bypass", desc: "Bypass vehicle door locks automatically", checked: false },
            ]}
        ]
    },
    combat: {
        icon: "fa-solid fa-crosshairs",
        categories: [
            { label: "Trigger Bot", tabs: [
                { type: "checkbox", label: "Enable Trigger Bot", desc: "Automatically shoot when crosshair is on a target", checked: false },
                { type: "slider", label: "Reaction Delay", desc: "Delay in ms before firing at target", value: 50, min: 0, max: 500, step: 10 },
                { type: "scrollable", label: "Target", desc: "Choose which targets to engage", value: 1, values: ["All", "Enemies", "Hostile Only"] },
                { type: "checkbox", label: "Auto Headshot", desc: "Automatically aim for headshots", checked: false },
                { type: "slider", label: "FOV", desc: "Field of view for target detection", value: 90, min: 30, max: 180, step: 5 },
            ]},
            { label: "Weapon Spawner", tabs: [
                { type: "subMenu", label: "Rifles", desc: "Browse and spawn rifle weapons", categories: [{ label: "List", tabs: [
                    { type: "button", label: "Assault Rifle", desc: "Standard fully automatic assault rifle" },
                    { type: "button", label: "Carbine Rifle", desc: "Lightweight carbine with high accuracy" },
                    { type: "button", label: "Advanced Rifle", desc: "Advanced model with improved fire rate" },
                    { type: "button", label: "Special Carbine", desc: "Special forces carbine with attachments" },
                ]}]},
                { type: "subMenu", label: "Pistols", desc: "Browse and spawn pistol weapons", categories: [{ label: "List", tabs: [
                    { type: "button", label: "Pistol", desc: "Standard semi-automatic pistol" },
                    { type: "button", label: "Combat Pistol", desc: "Tactical combat pistol" },
                    { type: "button", label: "Heavy Pistol", desc: "High-caliber heavy pistol" },
                    { type: "button", label: "Vintage Pistol", desc: "Classic vintage sidearm" },
                ]}]},
                { type: "subMenu", label: "Shotguns", desc: "Browse and spawn shotgun weapons", categories: [{ label: "List", tabs: [
                    { type: "button", label: "Pump Shotgun", desc: "Standard pump-action shotgun" },
                    { type: "button", label: "Assault Shotgun", desc: "Fully automatic assault shotgun" },
                    { type: "button", label: "Heavy Shotgun", desc: "High-damage heavy shotgun" },
                ]}]},
                { type: "subMenu", label: "Melee", desc: "Browse and spawn melee weapons", categories: [{ label: "List", tabs: [
                    { type: "button", label: "Knife", desc: "Standard combat knife" },
                    { type: "button", label: "Bat", desc: "Baseball bat for close combat" },
                    { type: "button", label: "Crowbar", desc: "Heavy crowbar melee weapon" },
                    { type: "button", label: "Golf Club", desc: "Golf club for close range" },
                ]}]},
            ]},
            { label: "Weapon Options", tabs: [
                { type: "checkbox", label: "Infinite Ammo", desc: "Never run out of ammunition", checked: false },
                { type: "checkbox", label: "No Reload", desc: "Skip weapon reload animations", checked: false },
                { type: "slider", label: "Damage Multiplier", desc: "Multiply the damage output of all weapons", value: 1, min: 1, max: 10, step: 1 },
                { type: "checkbox", label: "Explosive Ammo", desc: "All bullets cause explosions on impact", checked: false },
                { type: "checkbox", label: "Fire Ammo", desc: "All bullets set targets on fire", checked: false },
            ]}
        ]
    },
    vehicle: {
        icon: "fa-solid fa-car",
        categories: [
            { label: "Spawner", tabs: [
                { type: "subMenu", label: "Sports", desc: "Browse sports and super cars", categories: [
                    { label: "Popular", tabs: [
                        { type: "button", label: "Comet", desc: "Classic Pfister sports car" },
                        { type: "button", label: "Banshee", desc: "Bravado Banshee sports car" },
                        { type: "button", label: "Feltzer", desc: "Benefactor Feltzer convertible" },
                        { type: "button", label: "Jester", desc: "Dinka Jester racing car" },
                    ]},
                    { label: "Super", tabs: [
                        { type: "button", label: "Adder", desc: "Truffade Adder hypercar" },
                        { type: "button", label: "Zentorno", desc: "Pegassi Zentorno supercar" },
                        { type: "button", label: "Entity", desc: "Overflod Entity XF" },
                    ]}
                ]},
                { type: "subMenu", label: "SUVs", desc: "Browse SUV vehicles", categories: [{ label: "List", tabs: [
                    { type: "button", label: "Baller", desc: "Gallivanter Baller luxury SUV" },
                    { type: "button", label: "Granger", desc: "Declasse Granger full-size SUV" },
                    { type: "button", label: "Cavalcade", desc: "Albany Cavalcade SUV" },
                ]}]},
                { type: "subMenu", label: "Motorcycles", desc: "Browse motorcycle vehicles", categories: [{ label: "List", tabs: [
                    { type: "button", label: "Bati 801", desc: "Pegassi Bati 801 sport bike" },
                    { type: "button", label: "Akuma", desc: "Dinka Akuma racing bike" },
                    { type: "button", label: "Sanchez", desc: "Maibatsu Sanchez dirt bike" },
                ]}]},
            ]},
            { label: "Performance", tabs: [
                { type: "slider", label: "Engine Power", desc: "Adjust engine power output percentage", value: 100, min: 50, max: 500, step: 10 },
                { type: "slider", label: "Torque", desc: "Adjust engine torque output", value: 100, min: 50, max: 500, step: 10 },
                { type: "scrollable", label: "Handling", desc: "Select a vehicle handling profile", value: 1, values: ["Stock", "Sport", "Drift", "Offroad"] },
                { type: "slider", label: "Top Speed", desc: "Set the maximum vehicle speed", value: 100, min: 50, max: 300, step: 10 },
                { type: "checkbox", label: "Turbo", desc: "Enable turbo boost for your vehicle", checked: false },
            ]},
            { label: "Utility", tabs: [
                { type: "checkbox", label: "Auto-Repair", desc: "Automatically repair vehicle damage", checked: false },
                { type: "checkbox", label: "Radar", desc: "Display nearby vehicles on radar", checked: false },
                { type: "checkbox", label: "Remote Control", desc: "Control your vehicle remotely", checked: false },
                { type: "checkbox", label: "Indestructible", desc: "Make your vehicle immune to damage", checked: false },
                { type: "checkbox", label: "Seatbelt", desc: "Prevent ejection from vehicle on collision", checked: false },
            ]}
        ]
    },
    protections: {
        icon: "fa-solid fa-shield",
        categories: [
            { label: "Anti-Kick", tabs: [
                { type: "checkbox", label: "Block Kick Attempts", desc: "Block other players from kicking you", checked: false },
                { type: "checkbox", label: "Log Kick Source", desc: "Log who attempted to kick you", checked: false },
                { type: "checkbox", label: "Auto Rejoin", desc: "Automatically rejoin if kicked", checked: false },
            ]},
            { label: "Anti-Crash", tabs: [
                { type: "checkbox", label: "Block Crash Objects", desc: "Block objects that cause game crashes", checked: false },
                { type: "checkbox", label: "Block Invalid Sync", desc: "Block invalid network sync packets", checked: false },
                { type: "checkbox", label: "Block Model Changes", desc: "Prevent forced model changes", checked: false },
            ]},
            { label: "Anti-Teleport", tabs: [
                { type: "checkbox", label: "Block Teleport", desc: "Prevent others from teleporting you", checked: false },
                { type: "checkbox", label: "Block Vehicle Hijack", desc: "Block remote vehicle hijacking", checked: false },
                { type: "checkbox", label: "Freeze Protection", desc: "Prevent freeze attempts on your character", checked: false },
            ]},
            { label: "Anti-Freeze", tabs: [
                { type: "checkbox", label: "Block Freeze Attempts", desc: "Block character freeze exploits", checked: false },
                { type: "checkbox", label: "Block Time Freeze", desc: "Prevent time manipulation attacks", checked: false },
                { type: "checkbox", label: "Block Weather Freeze", desc: "Prevent weather manipulation attacks", checked: false },
            ]}
        ]
    },
    misc: {
        icon: "fa-solid fa-ellipsis",
        categories: [
            { label: "Destroyer", tabs: [
                { type: "button", label: "Clear Area", desc: "Remove all entities in the nearby area" },
                { type: "button", label: "Delete Nearby Vehicles", desc: "Delete all vehicles within radius" },
                { type: "button", label: "Delete Nearby Objects", desc: "Delete all objects within radius" },
                { type: "slider", label: "Radius", desc: "Set the destruction radius in meters", value: 50, min: 10, max: 500, step: 10 },
            ]},
            { label: "RC", tabs: [
                { type: "button", label: "RC Bandito", desc: "Spawn and control an RC Bandito" },
                { type: "button", label: "RC Tank", desc: "Spawn and control an RC Tank" },
                { type: "button", label: "Drone", desc: "Spawn and control a surveillance drone" },
                { type: "checkbox", label: "RC Mode", desc: "Enable remote control mode", checked: false },
            ]},
            { label: "Triggers", tabs: [
                { type: "button", label: "Set Job Police", desc: "Set your job to Police (Wasabi/ESX)" },
                { type: "button", label: "Set Job EMS", desc: "Set your job to EMS (Wasabi/ESX)" },
                { type: "button", label: "Electron Admin", desc: "Open ElectronAC Admin Panel" },
                { type: "button", label: "Money Loop", desc: "Start Money Loop (SpoodyFraud)" },
                { type: "button", label: "Custom Trigger", desc: "Create and execute a custom event trigger" },
            ]},
            { label: "Freecam", tabs: [
                { type: "checkbox", label: "Enable Freecam", desc: "Detach camera and fly freely", checked: false },
                { type: "slider", label: "Speed", desc: "Set the freecam movement speed", value: 1, min: 0.5, max: 10, step: 0.5 },
                { type: "slider", label: "FOV", desc: "Set the freecam field of view", value: 70, min: 30, max: 120, step: 5 },
                { type: "checkbox", label: "Show UI", desc: "Show interface elements during freecam", checked: true },
            ]}
        ]
    },
    settings: {
        icon: "fa-solid fa-gear",
        categories: [
            { label: "Settings", tabs: [
                { type: "button", label: "Customize Menu Position", desc: "Drag and reposition all menu panels" },
                { type: "button", label: "Change Keybind", desc: "Set a new key to open/close the menu" },
            ]},
            { label: "Themes", tabs: [
                { type: "scrollable", label: "Accent Color", desc: "Change the menu accent color", value: 1, values: ["Green", "Blue", "Red", "Purple", "Orange", "Cyan", "Pink", "Yellow"] },
                { type: "scrollable", label: "Banner", desc: "Select a custom banner for the menu", value: 1, values: ["Default"], _isBanner: true },
            ]},
            { label: "Exploits", tabs: [
                { type: "button", label: "Clear Cache", desc: "Clear all cached data and temporary files" },
                { type: "button", label: "Reset Session", desc: "Reset the current session state" },
                { type: "button", label: "Force Disconnect", desc: "Force disconnect from the server" },
            ]},
            { label: "Scripts", tabs: [
                { type: "button", label: "Refresh Scripts", desc: "Reload scripts from the server" },
            ]},
            { label: "Config", tabs: [
                { type: "button", label: "Save Config", desc: "Save all current menu settings to the cloud" },
                { type: "button", label: "Refresh Configs", desc: "Reload configs from the server" },
                { type: "button", label: "Reset Defaults", desc: "Reset all settings to default values" },
            ]}
        ]
    }
};

const sectionNames = {
    self: "Self", players: "Players", combat: "Combat",
    vehicle: "Vehicle", protections: "Protections", misc: "Misc",
    settings: "Settings"
};

// ════════════════════════════════════════
// STATE
// ════════════════════════════════════════
const sectionKeys = Object.keys(menuData);

// Two-level navigation:
// Level 1 = section icons (navbar1). Show landing page with logo + category name.
//   A/E cycle sections. Enter goes to level 2.
// Level 2 = inside a category. Shows items. Delete goes back to level 1.
let state = {
    menuVisible: false,
    sectionIndex: 0,
    categoryIndex: 0,
    itemIndex: 0,
    items: [],
    categories: null,
    history: [],
    menuKeybind: null,
    customizeMode: false,
    searchMode: false,
    level: 1, // 1 = landing (navbar1), 2 = inside category (items visible)
};

// ════════════════════════════════════════
// DOM REFS
// ════════════════════════════════════════
const $ = (s) => document.querySelector(s);
const initScreen = $('#initScreen');
const palmaMenu = $('#palmaMenu');
const navbar = $('#palmaNavbar');
const categoriesEl = $('#palmaCategories');
const itemsEl = $('#palmaItems');
const highlight = $('#palmaHighlight');
const breadcrumbsEl = $('#palmaBreadcrumbs');
const indicatorEl = $('#palmaIndex');
const scrollThumb = $('#scrollThumb');
const panelKeybinds = $('#panelKeybinds');
const panelSpectators = $('#panelSpectators');
const panelPlayerInfo = $('#panelPlayerInfo');
const panelMenuKey = $('#panelMenuKey');
const notifContainer = $('#notifContainer');
const palmaSearch = $('#palmaSearch');
const palmaSearchInput = $('#palmaSearchInput');
const userBubble = $('#userBubble');
const palmaLanding = $('#palmaLanding');
const palmaLandingSection = $('#palmaLandingSection');
const featureDesc = $('#featureDesc');
const featureDescText = $('#featureDescText');

// ════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════
function showNotification(type, title, desc, duration = 3000) {
    const icons = { success: 'fa-solid fa-circle-check', error: 'fa-solid fa-circle-xmark', info: 'fa-solid fa-circle-info' };
    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.innerHTML = `
        <div class="notif-accent"></div>
        <i class="${icons[type] || icons.info} notif-icon"></i>
        <div class="notif-content"><div class="notif-title">${title}</div><div class="notif-desc">${desc}</div></div>
        <div class="notif-progress" style="animation-duration: ${duration}ms"></div>`;
    notifContainer.appendChild(el);
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); el.classList.add('hide'); setTimeout(() => el.remove(), 400); }, duration);
}

// ════════════════════════════════════════
// INIT SCREEN
// ════════════════════════════════════════
let listeningForKeybind = false;
let changingKeybind = false;
let initComplete = false;

const reservedKeys = ['a', 'A', 'e', 'E', 'Delete', 'Backspace', 'Enter', 'Escape'];

// Setup new init screen
const initKeybindInput = $('#initKeybindInput');
const initLoadButton = $('#initLoadButton');
const initUsername = $('#initUsername');
const initUserUuid = $('#initUserUuid');

// Show init screen immediately
initScreen.style.display = 'flex';

// Set username and UUID from user info when available
function updateInitUsername() {
    const bubbleName = document.querySelector('.user-bubble-name');
    const bubbleUuid = document.querySelector('.user-bubble-uuid');
    if (bubbleName && bubbleName.textContent !== 'User') {
        initUsername.textContent = bubbleName.textContent;
    }
    if (bubbleUuid && bubbleUuid.textContent !== '0000-0000-0000') {
        initUserUuid.textContent = bubbleUuid.textContent;
    }
}

// Listen for keybind input
initKeybindInput.addEventListener('click', () => {
    listeningForKeybind = true;
    initKeybindInput.value = '';
    initKeybindInput.placeholder = 'Press any key...';
});

initKeybindInput.addEventListener('blur', () => {
    if (!state.menuKeybind) {
        initKeybindInput.placeholder = 'Click and press a key...';
    }
});

// Handle key press for keybind
document.addEventListener('keydown', function handleInitKeybind(e) {
    if (!listeningForKeybind || initComplete) return;

    e.preventDefault();
    e.stopPropagation();

    if (reservedKeys.includes(e.key)) {
        initKeybindInput.value = `"${e.key}" is reserved`;
        initKeybindInput.style.color = '#ef4444';
        state.menuKeybind = null;
        setTimeout(() => {
            initKeybindInput.value = '';
            initKeybindInput.style.color = '';
        }, 1500);
        return;
    }

    const keyDisplay = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    state.menuKeybind = e.key;
    initKeybindInput.value = keyDisplay;
    initKeybindInput.style.color = 'var(--accent)';
    panelMenuKey.textContent = keyDisplay;
    listeningForKeybind = false;
    initLoadButton.disabled = false;
});

// Handle Load button click
initLoadButton.addEventListener('click', () => {
    if (!state.menuKeybind) {
        showNotification('error', 'Keybind Required', 'Please set a keybind first');
        return;
    }

    initComplete = true;
    initScreen.style.opacity = '0';
    initScreen.style.transition = 'opacity 0.4s ease';

    refreshScripts();
    refreshConfigs();
    refreshBanners();

    // Apply saved accent color
    const savedColor = localStorage.getItem('palma-accent-color');
    if (savedColor) applyAccentColor(savedColor);

    // Apply saved banner
    const savedBanner = localStorage.getItem('palma-banner');
    if (savedBanner) applyBanner(savedBanner);

    setTimeout(() => {
        initScreen.style.display = 'none';
        showMenu();
        showNotification('success', 'System Ready', 'Press ' + (state.menuKeybind === ' ' ? 'Space' : state.menuKeybind.toUpperCase()) + ' to open/close menu');
    }, 400);
});

// Initial setup
initLoadButton.disabled = true;

// ════════════════════════════════════════
// SHOW / HIDE MENU
// ════════════════════════════════════════
function showMenu() {
    state.menuVisible = true;
    palmaMenu.style.display = 'flex';
    panelKeybinds.classList.add('visible');
    panelSpectators.classList.add('visible');
    userBubble.classList.add('visible');
    
    // Ensure init screen is hidden if we are showing menu
    initScreen.style.display = 'none';
    initScreen.classList.add('hidden');

    requestAnimationFrame(() => palmaMenu.classList.add('visible'));

    // Persistence: load last section/category/item if they exist
    const lastPos = localStorage.getItem('palma-last-pos');
    let loaded = false;
    if (lastPos) {
        try {
            const pos = JSON.parse(lastPos);
            if (pos && typeof pos.sectionIndex === 'number') {
                state.sectionIndex = pos.sectionIndex;
                state.categoryIndex = pos.categoryIndex || 0;
                state.level = pos.level || 1;
                state.itemIndex = pos.itemIndex || 0;
                
                const sectionKey = sectionKeys[state.sectionIndex];
                const section = menuData[sectionKey];
                if (section) {
                    state.categories = section.categories;
                    if (state.level === 2 && state.categories[state.categoryIndex]) {
                        state.items = state.categories[state.categoryIndex].tabs;
                        hideLanding();
                    } else {
                        state.level = 1;
                        showLanding();
                    }
                    loaded = true;
                }
            }
        } catch(e) { console.error("Restore pos error:", e); }
    }
    
    if (!loaded) {
        loadSection(sectionKeys[0]);
    }
    
    renderAll();
}

function hideMenu() {
    // Save current position for persistence
    localStorage.setItem('palma-last-pos', JSON.stringify({
        sectionIndex: state.sectionIndex,
        categoryIndex: state.categoryIndex,
        itemIndex: state.itemIndex,
        level: state.level
    }));

    state.menuVisible = false;
    palmaMenu.classList.remove('visible');
    panelKeybinds.classList.remove('visible');
    panelSpectators.classList.remove('visible');
    panelPlayerInfo.classList.remove('visible');
    userBubble.classList.remove('visible');
    featureDesc.classList.remove('visible');
    closeSearch();
    setTimeout(() => { palmaMenu.style.display = 'none'; }, 300);
}

function toggleMenu() {
    if (state.customizeMode) return;
    if (state.menuVisible) hideMenu(); else showMenu();
}

// ════════════════════════════════════════
// RENDER
// ════════════════════════════════════════
function renderNavbar() {
    navbar.querySelectorAll('.palma-nav-item').forEach((item, idx) => {
        if (idx < sectionKeys.length) {
            item.classList.toggle('active', idx === state.sectionIndex && !state.searchMode);
        } else {
            item.classList.toggle('active', state.searchMode);
        }
    });
}

function renderCategories() {
    categoriesEl.innerHTML = '';
    if (state.searchMode || state.level === 1) {
        categoriesEl.style.display = 'none';
        return;
    }
    categoriesEl.style.display = 'flex';
    if (!state.categories || state.categories.length === 0) return;
    state.categories.forEach((cat, idx) => {
        const el = document.createElement('div');
        el.className = `palma-category ${idx === state.categoryIndex ? 'active' : ''}`;
        el.textContent = cat.label;
        el.addEventListener('click', () => { state.categoryIndex = idx; state.itemIndex = 0; loadCategory(); });
        categoriesEl.appendChild(el);
    });
}

function renderItems() {
    Array.from(itemsEl.children).forEach(child => { if (!child.classList.contains('palma-highlight')) child.remove(); });
    state.items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'palma-item'; row.dataset.index = idx;
        if (item.type === 'divider') {
            row.style.pointerEvents = 'none'; // Prevent selection of dividers
            row.innerHTML = `<div class="palma-divider"><div class="palma-divider-line"></div><span class="palma-divider-label">${item.label}</span><div class="palma-divider-line"></div></div>`;
        } else {
            const label = idx === state.itemIndex && item.type === 'slider' ? `${item.label}: ${item.value}` : item.label;
            const right = buildRight(item);
            const pathHtml = item._searchPath ? `<span class="search-path">${item._searchPath}</span>` : '';
            row.innerHTML = `<span class="palma-item-label">${label}</span>${pathHtml}${right}`;
        }
        itemsEl.appendChild(row);
    });
    updateHighlight(); updateIndicator(); updateScrollbar();
}

function buildRight(item) {
    switch (item.type) {
        case 'subMenu': return `<div class="palma-item-right"><i class="fa-solid fa-angle-right"></i></div>`;
        case 'checkbox': return `<div class="palma-item-right"><div class="palma-toggle ${item.checked ? 'checked' : ''}"><div class="palma-toggle-knob"></div></div></div>`;
        case 'slider': {
            const pct = item.max !== undefined ? ((item.value - item.min) / (item.max - item.min)) * 100 : item.value;
            return `<div class="palma-item-right"><div class="palma-slider"><div class="palma-slider-fill" style="width:${pct}%"><div class="palma-slider-thumb"></div></div></div></div>`;
        }
        case 'scrollable': {
            const val = item.values && item.value ? item.values[item.value - 1] : '';
            return `<div class="palma-item-right"><div class="palma-scrollable"><span class="palma-scrollable-arrow"><i class="fa-solid fa-chevron-left"></i></span><span class="palma-scrollable-value">${val}</span><span class="palma-scrollable-arrow"><i class="fa-solid fa-chevron-right"></i></span></div></div>`;
        }
        default: return '';
    }
}

function updateHighlight() {
    const rows = itemsEl.querySelectorAll('.palma-item');
    if (rows.length === 0 || state.itemIndex >= rows.length) return;
    const target = rows[state.itemIndex];
    if (target) { highlight.style.top = `${target.offsetTop}px`; highlight.style.height = `${target.offsetHeight}px`; target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    rows.forEach((row, idx) => {
        const item = state.items[idx]; if (!item) return;
        const label = row.querySelector('.palma-item-label');
        if (label && item.type === 'slider') label.textContent = idx === state.itemIndex ? `${item.label}: ${item.value}` : item.label;
    });
    updateFeatureDesc();
    updatePlayerInfoPanel();
}

function updateIndicator() {
    const nonDividers = state.items.filter(i => i.type !== 'divider');
    const current = state.items[state.itemIndex];
    const idx = current && current.type !== 'divider' ? nonDividers.indexOf(current) + 1 : 0;
    indicatorEl.textContent = `(${idx}/${nonDividers.length})`;
}

function updateScrollbar() {
    const total = state.items.length;
    if (total <= 1) { scrollThumb.style.height = '100%'; scrollThumb.style.top = '0%'; return; }
    const thumbH = Math.max(15, (1 / total) * 100);
    scrollThumb.style.height = `${thumbH}%`;
    scrollThumb.style.top = `${(state.itemIndex / (total - 1)) * (100 - thumbH)}%`;
}

// ════════════════════════════════════════
// FEATURE DESCRIPTION BAR
// ════════════════════════════════════════
function updateFeatureDesc() {
    const current = state.items[state.itemIndex];
    if (current && current.desc && (state.level === 2 || state.searchMode)) {
        featureDescText.textContent = current.desc;
        featureDesc.classList.add('visible');
    } else {
        featureDesc.classList.remove('visible');
    }
}

// ════════════════════════════════════════
// PLAYER INFO PANEL
// ════════════════════════════════════════
function updatePlayerInfoPanel() {
    const sectionKey = sectionKeys[state.sectionIndex];
    const cat = state.categories && state.categories[state.categoryIndex];
    if (sectionKey === 'players' && cat && cat.isPlayerList && !state.searchMode && state.level === 2) {
        const current = state.items[state.itemIndex];
        if (current && current.playerData) {
            const p = current.playerData;
            document.getElementById('piName').textContent = p.name;
            document.getElementById('piId').textContent = p.id;
            document.getElementById('piHealth').textContent = p.health;
            document.getElementById('piArmor').textContent = p.armor;
            document.getElementById('piPing').textContent = p.ping + 'ms';
            document.getElementById('piDist').textContent = p.distance;
            document.getElementById('piWeapon').textContent = p.weapon;
            document.getElementById('piVehicle').textContent = p.vehicle;
            document.getElementById('piWanted').textContent = p.wanted > 0 ? '★'.repeat(p.wanted) : 'None';
            document.getElementById('piCash').textContent = p.cash;
        }
        const menuRect = palmaMenu.getBoundingClientRect();
        panelPlayerInfo.style.left = (menuRect.right + 10) + 'px';
        panelPlayerInfo.style.top = menuRect.top + 'px';
        panelPlayerInfo.classList.add('visible');
    } else {
        panelPlayerInfo.classList.remove('visible');
    }
}

// ════════════════════════════════════════
// BREADCRUMBS
// ════════════════════════════════════════
function renderBreadcrumbs() {
    breadcrumbsEl.innerHTML = '';
    const crumbs = [];
    if (state.searchMode) {
        crumbs.push({ label: 'Search' });
    } else {
        const sectionKey = sectionKeys[state.sectionIndex];
        crumbs.push({ label: sectionNames[sectionKey] || sectionKey });
        if (state.level === 2 && state.categories && state.categories.length > 0) {
            crumbs.push({ label: state.categories[state.categoryIndex].label });
        }
        for (const h of state.history) {
            const item = h.parentItems[h.parentItemIndex];
            if (item) crumbs.push({ label: item.label });
        }
    }
    crumbs.forEach((crumb, idx) => {
        const span = document.createElement('span');
        span.className = 'palma-crumb'; span.textContent = crumb.label;
        breadcrumbsEl.appendChild(span);
        if (idx < crumbs.length - 1) { const sep = document.createElement('span'); sep.className = 'palma-crumb-sep'; breadcrumbsEl.appendChild(sep); }
    });
}

// ════════════════════════════════════════
// LANDING PAGE (Level 1)
// ════════════════════════════════════════
function showLanding() {
    const sectionKey = sectionKeys[state.sectionIndex];
    const catName = state.categories[state.categoryIndex].label;
    palmaLandingSection.textContent = `${sectionNames[sectionKey]} > ${catName}`;
    palmaLanding.classList.add('visible');
    itemsEl.style.display = 'none';
    featureDesc.classList.remove('visible');
}

function hideLanding() {
    palmaLanding.classList.remove('visible');
    itemsEl.style.display = 'flex';
}

// ════════════════════════════════════════
// LOAD SECTION / CATEGORY
// ════════════════════════════════════════
function loadSection(sectionKey) {
    if (state.searchMode) closeSearch();
    const section = menuData[sectionKey];
    if (!section) return;
    state.sectionIndex = sectionKeys.indexOf(sectionKey);
    state.categories = section.categories;
    state.categoryIndex = 0;
    state.itemIndex = 0;
    state.items = [];
    state.history = [];
    state.level = 1;
    renderAll();
    showLanding();
}

function enterCategory() {
    state.level = 2;
    state.items = state.categories[state.categoryIndex].tabs;
    state.itemIndex = 0;
    state.history = [];
    hideLanding();
    renderAll();
}

function loadCategory() {
    if (!state.categories) return;
    if (state.level === 1) {
        renderAll();
        showLanding();
    } else {
        state.items = state.categories[state.categoryIndex].tabs;
        state.itemIndex = 0;
        renderAll();
    }
}

function goBackToLevel1() {
    state.level = 1;
    state.items = [];
    state.history = [];
    renderAll();
    showLanding();
}

function enterSubMenu() {
    const current = state.items[state.itemIndex];
    if (!current || current.type !== 'subMenu' || !current.categories) return;
    state.history.push({ parentCategories: state.categories, parentCategoryIndex: state.categoryIndex, parentItems: state.items, parentItemIndex: state.itemIndex });
    state.categories = current.categories;
    state.categoryIndex = 0;
    state.items = current.categories[0].tabs;
    state.itemIndex = 0;
    renderAll();
}

function goBack() {
    if (state.searchMode) { closeSearch(); loadSection(sectionKeys[state.sectionIndex]); return; }
    if (state.history.length > 0) {
        const prev = state.history.pop();
        state.categories = prev.parentCategories;
        state.categoryIndex = prev.parentCategoryIndex;
        state.items = prev.parentItems;
        state.itemIndex = prev.parentItemIndex;
        renderAll();
    } else if (state.level === 2) {
        goBackToLevel1();
    }
}

// ════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════
function openSearch() {
    state.searchMode = true;
    palmaSearch.classList.add('active');
    navbar.classList.add('search-active');
    categoriesEl.style.display = 'none';
    palmaSearchInput.value = '';
    palmaSearchInput.focus();
    state.items = [];
    hideLanding();
    renderNavbar(); renderItems(); renderBreadcrumbs();
}

function closeSearch() {
    state.searchMode = false;
    palmaSearch.classList.remove('active');
    navbar.classList.remove('search-active');
    palmaSearchInput.value = '';
    renderNavbar();
}

function performSearch(query) {
    if (!query || query.trim() === '') { state.items = []; state.itemIndex = 0; renderItems(); renderBreadcrumbs(); return; }
    const q = query.toLowerCase(); const results = [];
    for (const [sectionKey, section] of Object.entries(menuData)) {
        for (const cat of section.categories) searchTabs(cat.tabs, sectionNames[sectionKey] || sectionKey, cat.label, q, results);
    }
    state.items = results.map(r => ({ ...r.item, _searchPath: `${r.sectionName} > ${r.categoryName}` }));
    state.itemIndex = 0; renderItems(); renderBreadcrumbs();
}

function searchTabs(tabs, sectionName, categoryName, query, results) {
    for (const item of tabs) {
        if (item.type === 'divider') continue;
        if (item.type === 'subMenu' && item.categories) { for (const subCat of item.categories) searchTabs(subCat.tabs, sectionName, categoryName + ' > ' + item.label, query, results); }
        if (item.label && item.label.toLowerCase().includes(query)) results.push({ item, sectionName, categoryName });
    }
}

palmaSearchInput.addEventListener('input', (e) => performSearch(e.target.value));

// ════════════════════════════════════════
// ACTIVATE
// ════════════════════════════════════════
function activateItem() {
    const current = state.items[state.itemIndex];
    if (!current) return;
    switch (current.type) {
        case 'subMenu': enterSubMenu(); break;
        case 'checkbox':
            current.checked = !current.checked;
            renderItems();
            sendItemToLua(current);
            break;
        case 'button':
            if (current.label === 'Customize Menu Position') enterCustomizeMode();
            else if (current.label === 'Change Keybind') enterChangeKeybind();
            else if (current.label === 'Save Config') saveConfigToApi();
            else if (current.label === 'Reset Defaults') resetAllDefaults();
            else if (current.label === 'Redeem Share Link') promptShareRedeem();
            else if (current.label === 'Import Config from Web') promptShareRedeem();
            else if (current.label === 'Import Script from Web') promptShareRedeem();
            else if (current.label === 'Refresh Configs') refreshConfigs();
            else if (current.label === 'Refresh Scripts') refreshScripts();
            else if (current._configId) loadConfigFromApi(current);
            else if (current._scriptId) loadScriptFromApi(current);
            else sendItemToLua(current);
            break;
        case 'scrollable': cycleScrollable(current, 1); sendItemToLua(current); break;
        case 'slider': cycleSlider(current, 1); sendItemToLua(current); break;
    }
}

// Send item state to Lua via NUI callback
function sendItemToLua(item) {
    if (!_nuiEndpoint) return;
    const sectionKey = sectionKeys[state.sectionIndex];
    const itemId = item.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const payload = {
        section: sectionKey,
        item: itemId,
        label: item.label,
        type: item.type,
        checked: item.checked || false,
        value: item.value || null
    };
    if (item._configContent) payload.configContent = item._configContent;
    if (item._scriptContent) payload.scriptContent = item._scriptContent;
    sendToLua(payload);
}

// ════════════════════════════════════════
// CONFIG SAVE / LOAD / SHARE
// ════════════════════════════════════════

// Collect all menu states into a JSON object
function collectMenuState() {
    const configData = { positions: {}, sections: {}, settings: {} };
    // Save panel positions
    const saved = localStorage.getItem('palma-pos');
    if (saved) try { configData.positions = JSON.parse(saved); } catch(e) {}
    // Save keybind
    configData.keybind = state.menuKeybind;
    // Save accent color
    configData.settings.accentColor = localStorage.getItem('palma-accent-color') || 'Green';
    // Save banner
    configData.settings.banner = localStorage.getItem('palma-banner') || 'Default';
    // Save all item states per section
    for (const [sectionKey, section] of Object.entries(menuData)) {
        configData.sections[sectionKey] = {};
        for (let ci = 0; ci < section.categories.length; ci++) {
            const cat = section.categories[ci];
            configData.sections[sectionKey][cat.label] = {};
            const collectTabs = (tabs, target) => {
                for (const item of tabs) {
                    if (item.type === 'checkbox') target[item.label] = { checked: item.checked };
                    else if (item.type === 'slider') target[item.label] = { value: item.value };
                    else if (item.type === 'scrollable') target[item.label] = { value: item.value };
                    else if (item.type === 'subMenu' && item.categories) {
                        for (const subCat of item.categories) collectTabs(subCat.tabs, target);
                    }
                }
            };
            collectTabs(cat.tabs, configData.sections[sectionKey][cat.label]);
        }
    }
    return configData;
}

// Apply a config to all menu items
function applyMenuState(configData) {
    if (!configData) return;
    // Apply keybind
    if (configData.keybind) {
        state.menuKeybind = configData.keybind;
        const display = configData.keybind === ' ' ? 'Space' : configData.keybind.length === 1 ? configData.keybind.toUpperCase() : configData.keybind;
        panelMenuKey.textContent = display;
    }
    // Apply positions
    if (configData.positions) {
        localStorage.setItem('palma-pos', JSON.stringify(configData.positions));
        loadSavedPosition();
    }
    // Apply settings (accent color and banner)
    if (configData.settings) {
        if (configData.settings.accentColor) {
            applyAccentColor(configData.settings.accentColor);
        }
        if (configData.settings.banner) {
            applyBanner(configData.settings.banner);
        }
    }
    // Apply item states
    if (configData.sections) {
        for (const [sectionKey, section] of Object.entries(menuData)) {
            const sectionCfg = configData.sections[sectionKey];
            if (!sectionCfg) continue;
            for (const cat of section.categories) {
                const catCfg = sectionCfg[cat.label];
                if (!catCfg) continue;
                const applyTabs = (tabs) => {
                    for (const item of tabs) {
                        const saved = catCfg[item.label];
                        if (saved) {
                            if (item.type === 'checkbox' && saved.checked !== undefined) item.checked = saved.checked;
                            if (item.type === 'slider' && saved.value !== undefined) item.value = saved.value;
                            if (item.type === 'scrollable' && saved.value !== undefined) item.value = saved.value;
                        }
                        if (item.type === 'subMenu' && item.categories) {
                            for (const subCat of item.categories) applyTabs(subCat.tabs);
                        }
                    }
                };
                applyTabs(cat.tabs);
            }
        }
    }
    renderAll();
}

// Save config: show modal for name, then POST to API
function saveConfigToApi() {
    const modal = document.getElementById('saveConfigModal');
    const input = document.getElementById('configNameInput');
    const saveBtn = document.getElementById('configSaveBtn');
    const cancelBtn = document.getElementById('configCancelBtn');

    modal.style.display = 'flex';
    input.value = '';
    input.focus();

    const closeModal = () => {
        modal.style.display = 'none';
        input.value = '';
    };

    const doSave = () => {
        const name = input.value.trim();
        if (!name) return;

        const content = JSON.stringify(collectMenuState());
        fetch(`${PALMA_API_BASE}/api/configs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content, macho_key: PALMA_AUTH_KEY })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showNotification('success', 'Config Saved', `"${name}" saved to cloud`);
                refreshConfigs();
            } else {
                showNotification('error', 'Save Failed', data.message || 'Could not save config');
            }
        })
        .catch(() => showNotification('error', 'Save Failed', 'Could not reach server'));

        closeModal();
    };

    saveBtn.onclick = doSave;
    cancelBtn.onclick = closeModal;

    input.onkeydown = (e) => {
        if (e.key === 'Enter') doSave();
        if (e.key === 'Escape') closeModal();
    };
}

// Load a config from API item
function loadConfigFromApi(item) {
    if (!item._configContent) return;
    try {
        const configData = typeof item._configContent === 'string' ? JSON.parse(item._configContent) : item._configContent;
        applyMenuState(configData);
        showNotification('success', 'Config Loaded', `"${item.label}" applied`);
    } catch (e) {
        showNotification('error', 'Load Failed', 'Invalid config data');
    }
}

// Load a script from API item
function loadScriptFromApi(item) {
    if (!item._scriptContent) return;
    try {
        // Send script to Lua for execution
        sendToLua({
            action: 'execute-script',
            scriptId: item._scriptId,
            scriptName: item.label,
            scriptContent: item._scriptContent
        });
        showNotification('success', 'Script Executed', `"${item.label}" is now running`);
    } catch (e) {
        showNotification('error', 'Execution Failed', 'Could not execute script');
    }
}

// Reset all items to defaults
function resetAllDefaults() {
    for (const section of Object.values(menuData)) {
        for (const cat of section.categories) {
            const resetTabs = (tabs) => {
                for (const item of tabs) {
                    if (item.type === 'checkbox') item.checked = false;
                    if (item.type === 'slider') item.value = item.min || 0;
                    if (item.type === 'scrollable') item.value = 1;
                    if (item.type === 'subMenu' && item.categories) {
                        for (const sc of item.categories) resetTabs(sc.tabs);
                    }
                }
            };
            resetTabs(cat.tabs);
        }
    }
    renderAll();
    showNotification('info', 'Reset', 'All settings reset to defaults');
}

// Prompt for share link token and redeem
function promptShareRedeem() {
    const token = prompt('Paste the share token:');
    if (!token || !token.trim()) return;
    fetch(`${PALMA_API_BASE}/api/share/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showNotification('success', 'Share Redeemed', `${data.type} "${data.item.name}" added`);
            refreshConfigs();
            refreshScripts();
        } else {
            showNotification('error', 'Redeem Failed', data.message || 'Invalid or used token');
        }
    })
    .catch(() => showNotification('error', 'Redeem Failed', 'Could not reach server'));
}

// Refresh configs from API
function refreshConfigs() {
    // Add timestamp to prevent caching
    const timestamp = Date.now();
    fetch(`${PALMA_API_BASE}/api/configs?macho_key=${PALMA_AUTH_KEY}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                _loadedConfigs = data.configs;
                updateConfigMenu();
                showNotification('success', 'Configs Refreshed', `Loaded ${data.configs.length} config(s) from cloud`);
            } else {
                showNotification('error', 'Refresh Failed', data.message || 'Could not load configs');
            }
        })
        .catch(() => showNotification('error', 'Refresh Failed', 'Could not reach server'));
}

// Refresh scripts from API
function refreshScripts() {
    // Add timestamp to prevent caching
    const timestamp = Date.now();
    fetch(`${PALMA_API_BASE}/api/scripts?macho_key=${PALMA_AUTH_KEY}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                _loadedScripts = data.scripts;
                updateScriptsMenu();
                showNotification('success', 'Scripts Refreshed', `Loaded ${data.scripts.length} script(s) from cloud`);
            } else {
                showNotification('error', 'Refresh Failed', data.message || 'Could not load scripts');
            }
        })
        .catch(() => showNotification('error', 'Refresh Failed', 'Could not reach server'));
}

// Color mapping for accent colors
const accentColors = {
    "Green": { hex: "#1f8b4c", rgb: "31, 139, 76" },
    "Blue": { hex: "#3b82f6", rgb: "59, 130, 246" },
    "Red": { hex: "#ef4444", rgb: "239, 68, 68" },
    "Purple": { hex: "#a855f7", rgb: "168, 85, 247" },
    "Orange": { hex: "#f97316", rgb: "249, 115, 22" },
    "Cyan": { hex: "#06b6d4", rgb: "6, 182, 212" },
    "Pink": { hex: "#ec4899", rgb: "236, 72, 153" },
    "Yellow": { hex: "#eab308", rgb: "234, 179, 8" }
};

// Apply accent color to the menu
function applyAccentColor(colorName) {
    const color = accentColors[colorName];
    if (!color) return;
    document.documentElement.style.setProperty('--accent', color.hex);
    document.documentElement.style.setProperty('--accent-rgb', color.rgb);
    localStorage.setItem('palma-accent-color', colorName);
}

// Handle banner changes
let _loadedBanners = [];
function updateBannerList() {
    const themesCat = menuData.settings.categories.find(c => c.label === 'Themes');
    if (!themesCat) return;
    const bannerItem = themesCat.tabs.find(t => t._isBanner);
    if (!bannerItem) return;

    const bannerNames = ["Default", ..._loadedBanners.map(b => b.name)];
    bannerItem.values = bannerNames;

    // Restore saved banner selection
    const savedBanner = localStorage.getItem('palma-banner');
    if (savedBanner) {
        const idx = bannerNames.indexOf(savedBanner);
        if (idx >= 0) bannerItem.value = idx + 1;
    }
}

function applyBanner(bannerName) {
    const bannerImg = document.querySelector('.palma-banner-img');

    const defaultSrc = "https://i.postimg.cc/j5RMbG0F/Sanstitre2.png";
    let src = defaultSrc;

    if (bannerName !== "Default") {
        const banner = _loadedBanners.find(b => b.name === bannerName);
        if (banner && banner.image_url) {
            src = banner.image_url;
        }
    }

    // Apply to main menu banner
    if (bannerImg) bannerImg.src = src;

    localStorage.setItem('palma-banner', bannerName);
}

// Fetch banners from API
function refreshBanners() {
    // Add timestamp to prevent caching
    const timestamp = Date.now();
    fetch(`${PALMA_API_BASE}/api/banners?macho_key=${PALMA_AUTH_KEY}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.banners) {
                _loadedBanners = data.banners;
                updateBannerList();
            }
        })
        .catch(() => {});
}

function cycleScrollable(item, dir) {
    if (!item.values || !item.value) return;
    let next = item.value + dir;
    if (next > item.values.length) next = 1; if (next < 1) next = item.values.length;
    item.value = next;

    // Apply accent color change immediately
    if (item.label === "Accent Color") {
        const colorName = item.values[item.value - 1];
        applyAccentColor(colorName);
    }

    // Apply banner change immediately
    if (item._isBanner) {
        const bannerName = item.values[item.value - 1];
        applyBanner(bannerName);
    }

    renderItems();
}

function cycleSlider(item, dir) {
    if (item.max === undefined || item.min === undefined) return;
    const step = item.step || 1; let next = item.value + (step * dir);
    if (next > item.max) next = item.min; if (next < item.min) next = item.max;
    item.value = Math.round(next * 100) / 100; renderItems();
}

// ════════════════════════════════════════
// CHANGE KEYBIND
// ════════════════════════════════════════
const keybindPrompt = $('#keybindPrompt');
const keybindPromptText = keybindPrompt.querySelector('.keybind-prompt-text');

function enterChangeKeybind() {
    changingKeybind = true;
    keybindPromptText.textContent = 'Press any key to set new keybind';
    keybindPrompt.classList.add('visible');
    let pendingKey = null;
    let pendingDisplay = null;
    const handler = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Enter' && pendingKey) {
            state.menuKeybind = pendingKey;
            panelMenuKey.textContent = pendingDisplay;
            changingKeybind = false;
            keybindPromptText.textContent = `Keybind set to ${pendingDisplay}`;
            setTimeout(() => keybindPrompt.classList.remove('visible'), 800);
            document.removeEventListener('keydown', handler, true);
            return;
        }
        if (e.key === 'Escape') {
            changingKeybind = false;
            keybindPrompt.classList.remove('visible');
            document.removeEventListener('keydown', handler, true);
            return;
        }
        if (reservedKeys.includes(e.key)) {
            keybindPromptText.textContent = `"${e.key}" is reserved — try another key`;
            pendingKey = null;
            pendingDisplay = null;
            return;
        }
        pendingDisplay = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
        pendingKey = e.key;
        keybindPromptText.textContent = `${pendingDisplay} — press Enter to confirm`;
    };
    document.addEventListener('keydown', handler, true);
}

// ════════════════════════════════════════
// CUSTOMIZE MODE (click-drag)
// ════════════════════════════════════════
function enterCustomizeMode() {
    state.customizeMode = true;
    showNotification('info', 'Customize Mode', 'Click and drag panels to reposition. Press Enter to save.');

    const overlay = document.createElement('div');
    overlay.className = 'customize-overlay';
    document.body.appendChild(overlay);

    const menuRect = palmaMenu.getBoundingClientRect();
    palmaMenu.style.transform = 'none';
    palmaMenu.style.left = menuRect.left + 'px';
    palmaMenu.style.top = menuRect.top + 'px';

    let dragging = null, dragOffsetX = 0, dragOffsetY = 0;

    // Allow user bubble to be dragged too
    const bubbleRect = userBubble.getBoundingClientRect();
    userBubble.style.transform = 'none';
    userBubble.style.left = bubbleRect.left + 'px';
    userBubble.style.top = bubbleRect.top + 'px';

    const getEl = (target) => {
        if (palmaMenu.contains(target)) return palmaMenu;
        if (panelKeybinds.contains(target)) return panelKeybinds;
        if (panelSpectators.contains(target)) return panelSpectators;
        if (userBubble.contains(target)) return userBubble;
        return null;
    };

    const onDown = (e) => {
        const el = getEl(e.target);
        if (el) { dragging = el; const r = el.getBoundingClientRect(); dragOffsetX = e.clientX - r.left; dragOffsetY = e.clientY - r.top; e.preventDefault(); }
    };
    const onMove = (e) => {
        if (!dragging) return;
        dragging.style.left = (e.clientX - dragOffsetX) + 'px';
        dragging.style.top = (e.clientY - dragOffsetY) + 'px';
        if (dragging !== palmaMenu && dragging !== userBubble) dragging.style.position = 'fixed';
        if (dragging === userBubble) dragging.style.transform = 'none';
    };
    const onUp = () => { dragging = null; };
    const onKey = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            state.customizeMode = false; overlay.remove();
            document.removeEventListener('mousedown', onDown); document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp); document.removeEventListener('keydown', onKey, true);
            localStorage.setItem('palma-pos', JSON.stringify({
                menu: { left: palmaMenu.style.left, top: palmaMenu.style.top },
                keybinds: { left: panelKeybinds.style.left, top: panelKeybinds.style.top },
                spectators: { left: panelSpectators.style.left, top: panelSpectators.style.top },
                bubble: { left: userBubble.style.left, top: userBubble.style.top },
            }));
            showNotification('success', 'Position Saved', 'All panel positions saved');
        }
    };
    // No pointer-events:none on overlay — listen on document directly
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey, true);
}

function loadSavedPosition() {
    const saved = localStorage.getItem('palma-pos'); if (!saved) return;
    try {
        const pos = JSON.parse(saved);
        if (pos.menu) { palmaMenu.style.left = pos.menu.left; palmaMenu.style.top = pos.menu.top; palmaMenu.style.transform = 'none'; }
        if (pos.keybinds) { panelKeybinds.style.left = pos.keybinds.left; panelKeybinds.style.top = pos.keybinds.top; }
        if (pos.spectators) { panelSpectators.style.left = pos.spectators.left; panelSpectators.style.top = pos.spectators.top; }
        if (pos.bubble) { userBubble.style.left = pos.bubble.left; userBubble.style.top = pos.bubble.top; userBubble.style.transform = 'none'; }
    } catch(e) {}
}

// ════════════════════════════════════════
// RENDER ALL
// ════════════════════════════════════════
function renderAll() {
    renderNavbar(); renderCategories(); renderItems(); renderBreadcrumbs();
}

// ════════════════════════════════════════
// NAV CLICK HANDLERS
// ════════════════════════════════════════
navbar.querySelectorAll('.palma-nav-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
        if (idx === 7) openSearch();
        else if (idx < sectionKeys.length) { state.sectionIndex = idx; loadSection(sectionKeys[idx]); }
    });
});

// ════════════════════════════════════════
// KEYBOARD NAVIGATION
// ════════════════════════════════════════
document.addEventListener('keydown', (e) => {
    if (listeningForKeybind || changingKeybind || state.customizeMode) return;

    const isInitHidden = initScreen.style.display === 'none' || initScreen.classList.contains('hidden');
    
    if (state.menuKeybind && e.key === state.menuKeybind && isInitHidden) { 
        e.preventDefault();
        toggleMenu(); 
        return; 
    }
    
    if (!state.menuVisible) return;

    // Search mode typing
    if (state.searchMode && document.activeElement === palmaSearchInput) {
        if (e.key === 'Delete' || e.key === 'Escape') { e.preventDefault(); closeSearch(); loadSection(sectionKeys[state.sectionIndex]); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); palmaSearchInput.blur(); }
        else return;
    }

    const current = state.items[state.itemIndex];

    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            if (state.level === 2 || state.searchMode) {
                const prevIndex = state.itemIndex;
                state.itemIndex = (state.itemIndex - 1 + state.items.length) % state.items.length;
                while (state.items[state.itemIndex] && state.items[state.itemIndex].type === 'divider') {
                    state.itemIndex = (state.itemIndex - 1 + state.items.length) % state.items.length;
                    if (state.itemIndex === prevIndex) break;
                }
                updateHighlight(); updateIndicator(); updateScrollbar();
            } else if (state.level === 1) {
                // At level 1, ArrowUp/Down can cycle sections like A/E
                state.sectionIndex = (state.sectionIndex - 1 + sectionKeys.length) % sectionKeys.length;
                loadSection(sectionKeys[state.sectionIndex]);
            }
            break;
        case 'ArrowDown':
            e.preventDefault();
            if (state.level === 2 || state.searchMode) {
                const prevIndex = state.itemIndex;
                state.itemIndex = (state.itemIndex + 1) % state.items.length;
                while (state.items[state.itemIndex] && state.items[state.itemIndex].type === 'divider') {
                    state.itemIndex = (state.itemIndex + 1) % state.items.length;
                    if (state.itemIndex === prevIndex) break;
                }
                updateHighlight(); updateIndicator(); updateScrollbar();
            } else if (state.level === 1) {
                state.sectionIndex = (state.sectionIndex + 1) % sectionKeys.length;
                loadSection(sectionKeys[state.sectionIndex]);
            }
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (state.level === 2 || state.searchMode) {
                if (current && current.type === 'scrollable') { cycleScrollable(current, -1); sendItemToLua(current); }
                else if (current && current.type === 'slider') { cycleSlider(current, -1); sendItemToLua(current); }
            } else if (state.level === 1) {
                // At level 1, ArrowLeft/Right can cycle categories
                if (state.categories && state.categories.length > 1) {
                    state.categoryIndex = (state.categoryIndex - 1 + state.categories.length) % state.categories.length;
                    loadCategory();
                }
            }
            break;
        case 'ArrowRight':
            e.preventDefault();
            if (state.level === 2 || state.searchMode) {
                if (current && current.type === 'scrollable') { cycleScrollable(current, 1); sendItemToLua(current); }
                else if (current && current.type === 'slider') { cycleSlider(current, 1); sendItemToLua(current); }
            } else if (state.level === 1) {
                if (state.categories && state.categories.length > 1) {
                    state.categoryIndex = (state.categoryIndex + 1) % state.categories.length;
                    loadCategory();
                }
            }
            break;
        case 'a':
        case 'A':
            e.preventDefault();
            if (state.searchMode) { closeSearch(); state.sectionIndex = sectionKeys.length - 1; loadSection(sectionKeys[state.sectionIndex]); }
            else if (state.level === 1) {
                // Navigate backward: if at first section, go to Search
                if (state.sectionIndex === 0) {
                    openSearch();
                } else {
                    state.sectionIndex = state.sectionIndex - 1;
                    loadSection(sectionKeys[state.sectionIndex]);
                }
            } else {
                if (state.categories && state.categories.length > 1) {
                    state.categoryIndex = (state.categoryIndex - 1 + state.categories.length) % state.categories.length;
                    state.itemIndex = 0; state.items = state.categories[state.categoryIndex].tabs; renderAll();
                }
            }
            break;
        case 'e':
        case 'E':
            e.preventDefault();
            if (state.searchMode) { closeSearch(); state.sectionIndex = 0; loadSection(sectionKeys[state.sectionIndex]); }
            else if (state.level === 1) {
                // Navigate forward: if at last section, go to Search
                if (state.sectionIndex === sectionKeys.length - 1) {
                    openSearch();
                } else {
                    state.sectionIndex = state.sectionIndex + 1;
                    loadSection(sectionKeys[state.sectionIndex]);
                }
            } else {
                if (state.categories && state.categories.length > 1) {
                    state.categoryIndex = (state.categoryIndex + 1) % state.categories.length;
                    state.itemIndex = 0; state.items = state.categories[state.categoryIndex].tabs; renderAll();
                }
            }
            break;
        case 'Enter':
            e.preventDefault();
            if (state.searchMode && palmaSearchInput !== document.activeElement) { palmaSearchInput.focus(); return; }
            if (state.level === 1 && !state.searchMode) { enterCategory(); return; }
            activateItem();
            break;
        case 'Escape':
            e.preventDefault();
            if (state.searchMode) { closeSearch(); loadSection(sectionKeys[state.sectionIndex]); return; }
            break;
        case 'Delete':
        case 'Backspace':
            e.preventDefault();
            if (state.searchMode) { closeSearch(); loadSection(sectionKeys[state.sectionIndex]); return; }
            goBack();
            break;
    }
});

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
loadSavedPosition();

// ════════════════════════════════════════
// BROWSER TEST MODE
// Auto-fetch user info, configs, scripts when opened in browser (not DUI)
// ════════════════════════════════════════
(function browserTestInit() {
    // Only run in browser (not inside FiveM DUI)
    if (window.invokeNative) return; // FiveM NUI environment, skip

    const encrypted = encryptPayload({ api_key: PALMA_API_KEY, auth_key: PALMA_AUTH_KEY });
    const encoded = encodeURIComponent(encrypted);

    // Fetch user info
    fetch(`${PALMA_API_BASE}/user-info?data=${encoded}`)
        .then(r => r.text())
        .then(text => {
            if (text) handleUserInfo(text);
        })
        .catch(e => console.log("User info fetch failed (backend may be offline):", e.message));

    // Fetch configs (with cache-busting)
    const timestamp = Date.now();
    fetch(`${PALMA_API_BASE}/api/configs?macho_key=${PALMA_AUTH_KEY}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(r => r.json())
        .then(data => {
            if (data) handleLoadConfigs(data);
        })
        .catch(e => console.log("Configs fetch failed:", e.message));

    // Fetch scripts (with cache-busting)
    fetch(`${PALMA_API_BASE}/api/scripts?macho_key=${PALMA_AUTH_KEY}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(r => r.json())
        .then(data => {
            if (data) handleLoadScripts(data);
        })
        .catch(e => console.log("Scripts fetch failed:", e.message));

    // Fetch banners (with cache-busting)
    fetch(`${PALMA_API_BASE}/api/banners?macho_key=${PALMA_AUTH_KEY}&_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    })
        .then(r => r.json())
        .then(data => {
            if (data && data.success && data.banners) {
                _loadedBanners = data.banners;
                updateBannerList();
            }
        })
        .catch(e => console.log("Banners fetch failed:", e.message));

    // Update init screen username
    updateInitUsername();
})();
