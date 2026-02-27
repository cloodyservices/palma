-- ════════════════════════════════════════════════════════════
-- PALMA MENU - FiveM Client Script
-- DUI + Keyboard + Auth + User Info + NUI Callbacks
-- ════════════════════════════════════════════════════════════
-- CONFIG
local PALMA_API_BASE = "http://localhost:5000"
local PALMA_API_KEY = "oXstp8j6obMMQ2owaHI48UraSBKc4OFg"
local PALMA_SECRET = "PALMAAAAAAAAAAAAA2.666666666666"

-- DUI
local _palma_dui = MachoCreateDui("http://127.0.0.1:5500/palma%20ui/index.html")
MachoShowDui(_palma_dui)

-- State
local _palma_res, _palma_ac_res, _palma_tok, _palma_locked = nil, nil,
                                                             math.random(
                                                                 10000000,
                                                                 99999999),
                                                             false
local _palma_categories = {}

-- ════════════════════════════════════════
-- ENCRYPTION (must match backend api.js)
-- ════════════════════════════════════════
local function xorStr(str, key)
    local out = {}
    for i = 1, #str do
        local ki = ((i - 1) % #key) + 1
        out[i] = string.char(bit32.bxor(string.byte(str, i),
                                        string.byte(key, ki)))
    end
    return table.concat(out)
end

local function rot(str, shift)
    shift = shift or 3
    local out = {}
    for i = 1, #str do
        local v = string.byte(str, i)
        out[i] = string.char(bit32.bor(bit32.band(bit32.lshift(v, shift), 0xFF),
                                       bit32.band(bit32.rshift(v, 8 - shift),
                                                  0xFF)))
    end
    return table.concat(out)
end

local function b64Encode(str)
    local b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    return ((str:gsub('.', function(x)
        local r, b2 = '', x:byte()
        for i = 8, 1, -1 do
            r = r .. (b2 % 2 ^ i - b2 % 2 ^ (i - 1) > 0 and '1' or '0')
        end
        return r
    end) .. '0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
        if (#x < 6) then return '' end
        local c = 0
        for i = 1, 6 do c = c + (x:sub(i, i) == '1' and 2 ^ (6 - i) or 0) end
        return b:sub(c + 1, c + 1)
    end) .. ({'', '==', '='})[#str % 3 + 1])
end

local function encryptPayload(obj)
    local jsonStr = json.encode(obj)
    local step1 = xorStr(jsonStr, PALMA_SECRET)
    local step2 = rot(step1, 3)
    return b64Encode(step2)
end

-- ════════════════════════════════════════
-- NOTIFICATIONS (via DUI)
-- ════════════════════════════════════════
local function sendNotification(type, title, message, duration)
    MachoSendDuiMessage(_palma_dui, json.encode({
        action = "show-notification",
        type = type,
        title = title,
        message = message,
        duration = duration
    }))
end

-- ════════════════════════════════════════
-- DUI DESTROY
-- ════════════════════════════════════════
local function destroyDui()
    MachoHideDui(_palma_dui)
    Wait(1000)
    MachoDestroyDui(_palma_dui)
end

-- ════════════════════════════════════════
-- RESOURCE CATEGORIZATION & INJECTION
-- ════════════════════════════════════════
local function categorizeResources(cb)
    local count, getMeta = GetNumResources(), GetResourceMetadata
    for i = 0, count - 1 do
        local name = GetResourceByFindIndex(i)
        if name and GetResourceState(name) ~= "missing" then
            local ui_page = getMeta(name, "ui_page", 0)
            local cs_raw, cs_single = getMeta(name, "client_scripts", 0),
                                      getMeta(name, "client_script", 0)
            _palma_categories[name] = {
                fxap = LoadResourceFile(name, ".fxap") ~= nil,
                ui_page = ui_page and ui_page ~= "",
                map = getMeta(name, "this_is_a_map", 0) == "yes",
                lua54 = getMeta(name, "lua54", 0) == "yes",
                loadscreen = (getMeta(name, "loadscreen_cursor", 0) == "yes" or
                    getMeta(name, "loadscreen_manual_shutdown", 0) == "yes"),
                client = (cs_raw ~= "" and cs_raw ~= "[]" and cs_raw ~= "{}") or
                    (cs_single ~= "" and cs_single ~= "[]" and cs_single ~= "{}"),
                ac_on = name == "LifeShield" or name == "WaveShield" or
                    getMeta(name, "ac", 0) == "fg" or
                    LoadResourceFile(name, "cl-resource-obfuscated.lua") ~= nil
            }
        end
        Wait(0)
    end
    cb()
end

local function filterResources(fxap, ui_page, lua54, client, map, loadscreen,
                               ac_on)
    local matches, priorityGroups = {}, {}
    for name, data in pairs(_palma_categories) do
        local ok = true
        if fxap ~= nil and data.fxap ~= fxap then ok = false end
        if ui_page ~= nil and data.ui_page ~= ui_page then ok = false end
        if map ~= nil and data.map ~= map then ok = false end
        if lua54 ~= nil and data.lua54 ~= lua54 then ok = false end
        if loadscreen ~= nil and data.loadscreen ~= loadscreen then
            ok = false
        end
        if client ~= nil and data.client ~= client then ok = false end
        if ac_on ~= nil and data.ac_on ~= ac_on then ok = false end
        if ok then table.insert(matches, name) end
        Wait(0)
    end
    if #matches == 0 then return nil end
    for _, name in ipairs(matches) do
        local data, p = _palma_categories[name], 0
        if fxap ~= false and data.fxap then p = p + 32 end
        if ui_page ~= false and data.ui_page then p = p + 16 end
        if lua54 ~= false and data.lua54 then p = p + 8 end
        if client ~= false and data.client then p = p + 4 end
        if map ~= false and data.map then p = p + 2 end
        if loadscreen ~= false and data.loadscreen then p = p + 1 end
        if ac_on ~= false and data.ac_on then p = p + 0.5 end
        priorityGroups[p] = priorityGroups[p] or {}
        table.insert(priorityGroups[p], name)
    end
    local sorted = {}
    for pr, _ in pairs(priorityGroups) do table.insert(sorted, pr) end
    table.sort(sorted, function(a, b) return a > b end)
    for _, pr in ipairs(sorted) do
        local group = priorityGroups[pr]
        for i = #group, 2, -1 do
            local j = math.random(i);
            group[i], group[j] = group[j], group[i]
        end
        for _, rn in ipairs(group) do
            if MachoResourceInjectable(rn) then return rn end
            Wait(0)
        end
    end
    return nil
end

-- ════════════════════════════════════════
-- INITIALIZATION
-- ════════════════════════════════════════
sendNotification("default", nil, "Palma Menu is loading, please wait...", 7000)

-- Categorize resources
categorizeResources(function()
    Wait(1500)
    _palma_res = filterResources(nil, true, nil, true, false, false) or "any"
    _palma_ac_res = filterResources(false, false, true, false, false, false,
                                    true)
    if not _palma_res then
        sendNotification("error", nil, "Injection failed, please try again...",
                         10000)
        _palma_locked = true
    end
end)

-- Authentication
-- sendNotification("info", nil, "Authenticating...", 2000)
-- Wait(3000)
-- local _palma_keys = MachoWebRequest(PALMA_API_BASE .. "/keys")
local _palma_auth_key = MachoAuthenticationKey()
-- local _palma_auth_ok = string.find(_palma_keys, _palma_auth_key) or "devmode"

-- if _palma_auth_ok ~= nil then
--     sendNotification("success", nil, "Authentication successful...", 5000)
-- else
--     sendNotification("error", nil, "Authentication failed...", 7000)
--     return false
-- end

Wait(4000)
while _palma_res == nil and not _palma_locked do Wait(500) end
if _palma_locked then
    Citizen.CreateThread(function()
        Wait(10000);
        destroyDui()
    end)
    return false
end

if _palma_ac_res then
    sendNotification("info", nil,
                     "Anti-cheat detected [" .. _palma_ac_res .. "]...", 7000)
else
    sendNotification("error", nil,
                     "No known anti-cheat detected, server may use a custom one.",
                     7000)
end

sendNotification("default", nil, "Bypasses loaded...", 5000)
Wait(2000)

-- ════════════════════════════════════════
-- FETCH USER INFO FROM API
-- ════════════════════════════════════════
local function fetchUserInfo()
    local payload = encryptPayload({
        api_key = PALMA_API_KEY,
        auth_key = _palma_auth_key
    })
    local encoded = payload:gsub("+", "%%2B"):gsub("/", "%%2F")
                        :gsub("=", "%%3D")
    local url = PALMA_API_BASE .. "/user-info?data=" .. encoded
    local response = MachoWebRequest(url)
    if response and response ~= "" then
        -- The response is encrypted, send raw to UI which will display it
        -- Actually we decrypt here and send plain data to DUI
        -- For simplicity, we send the encrypted response and let the UI handle, or decode here
        MachoSendDuiMessage(_palma_dui, json.encode(
                                {
                action = "user-info-encrypted",
                data = response
            }))
    end
end

fetchUserInfo()

-- ════════════════════════════════════════
-- FETCH CONFIGS & SCRIPTS FROM API
-- ════════════════════════════════════════
local function fetchConfigs()
    local url = PALMA_API_BASE .. "/api/configs?macho_key=" ..
                    (_palma_auth_key or "")
    local response = MachoWebRequest(url)
    if response and response ~= "" then
        MachoSendDuiMessage(_palma_dui, json.encode(
                                {action = "load-configs", data = response}))
    end
end

local function fetchScripts()
    local url = PALMA_API_BASE .. "/api/scripts?macho_key=" ..
                    (_palma_auth_key or "")
    local response = MachoWebRequest(url)
    if response and response ~= "" then
        MachoSendDuiMessage(_palma_dui, json.encode(
                                {action = "load-scripts", data = response}))
    end
end

fetchConfigs()
fetchScripts()

sendNotification("success", nil, "Palma Menu is now ready to use...", 5000)
MachoSetLoggerState(0)
MachoLockLogger(1)
Wait(4000)

-- Send NUI endpoint and Auth Key to UI
MachoSendDuiMessage(_palma_dui, json.encode({
    action = "send-endpoint",
    value = "https://" .. _palma_res .. "/" .. _palma_tok .. "/"
}))
MachoSendDuiMessage(_palma_dui, json.encode(
                        {action = "set-auth-key", value = _palma_auth_key}))

-- ════════════════════════════════════════
-- KEYBOARD HANDLER
-- ════════════════════════════════════════
Citizen.CreateThread(function()
    local function sendKey(key, value, keyType)
        MachoSendDuiMessage(_palma_dui, json.encode(
                                {
                action = "keyboard",
                key = key,
                value = value,
                keyType = keyType
            }))
    end

    local keyMap = {
        [0x08] = "Backspace",
        [0x09] = "Tab",
        [0x0D] = "Enter",
        [0x1B] = "Escape",
        [0x20] = "Space",
        [0x21] = "PageUp",
        [0x22] = "PageDown",
        [0x23] = "End",
        [0x24] = "Home",
        [0x25] = "ArrowLeft",
        [0x26] = "ArrowUp",
        [0x27] = "ArrowRight",
        [0x28] = "ArrowDown",
        [0x2E] = "Delete",
        [0x30] = "0",
        [0x31] = "1",
        [0x32] = "2",
        [0x33] = "3",
        [0x34] = "4",
        [0x35] = "5",
        [0x36] = "6",
        [0x37] = "7",
        [0x38] = "8",
        [0x39] = "9",
        [0x41] = "A",
        [0x42] = "B",
        [0x43] = "C",
        [0x44] = "D",
        [0x45] = "E",
        [0x46] = "F",
        [0x47] = "G",
        [0x48] = "H",
        [0x49] = "I",
        [0x4A] = "J",
        [0x4B] = "K",
        [0x4C] = "L",
        [0x4D] = "M",
        [0x4E] = "N",
        [0x4F] = "O",
        [0x50] = "P",
        [0x51] = "Q",
        [0x52] = "R",
        [0x53] = "S",
        [0x54] = "T",
        [0x55] = "U",
        [0x56] = "V",
        [0x57] = "W",
        [0x58] = "X",
        [0x59] = "Y",
        [0x5A] = "Z",
        [0x70] = "F1",
        [0x71] = "F2",
        [0x72] = "F3",
        [0x73] = "F4",
        [0x74] = "F5",
        [0x75] = "F6",
        [0x76] = "F7",
        [0x77] = "F8",
        [0x78] = "F9",
        [0x79] = "F10",
        [0x7A] = "F11",
        [0x7B] = "F12",
        [0xBA] = ";",
        [0xBB] = "=",
        [0xBC] = ",",
        [0xBD] = "-",
        [0xBE] = ".",
        [0xBF] = "/",
        [0xC0] = "`",
        [0xDB] = "[",
        [0xDC] = "\\",
        [0xDD] = "]",
        [0xDE] = "'"
    }

    MachoOnKeyDown(function(vk)
        local keyName = keyMap[vk]
        if keyName then
            local keyType = "navigation"
            if vk >= 0x30 and vk <= 0x39 then
                keyType = "number"
            elseif vk >= 0x41 and vk <= 0x5A then
                keyType = "letter"
            elseif vk >= 0x70 and vk <= 0x7B then
                keyType = "function"
            elseif vk == 0x20 then
                keyType = "space"
            elseif vk == 0x08 or vk == 0x2E then
                keyType = "edit"
            elseif vk == 0x0D then
                keyType = "enter"
            elseif vk == 0x1B then
                keyType = "escape"
            elseif vk >= 0x25 and vk <= 0x28 then
                keyType = "arrow"
            end
            sendKey(keyName, vk, keyType)
        end
    end)
end)

-- ════════════════════════════════════════
-- PLAYER LIST LOOPER
-- ════════════════════════════════════════
Citizen.CreateThread(function()
    while true do
        Wait(2000)
        local players = {}
        for _, pid in ipairs(GetActivePlayers()) do
            local ped = GetPlayerPed(pid)
            if DoesEntityExist(ped) then
                table.insert(players, {
                    id = GetPlayerServerId(pid),
                    name = GetPlayerName(pid) or "Unknown",
                    health = GetEntityHealth(ped),
                    armor = GetPedArmour(ped)
                })
            end
        end
        MachoSendDuiMessage(_palma_dui, json.encode({
            action = "update-players",
            players = players
        }))
    end
end)

-- ════════════════════════════════════════
-- CROSS-RESOURCE EXECUTION BRIDGE
-- ════════════════════════════════════════
local _palma_exec_evt = "palma:exec:" .. tostring(_palma_tok)
RegisterNetEvent(_palma_exec_evt)
AddEventHandler(_palma_exec_evt, function(action, data)
    if action == "setjobpolice" then
        MachoInjectResource("wasabi_multijob", [[
            local job = { label = "Police", name = "police", grade = 1, grade_label = "Officer", grade_name = "officer" }
            if CheckJob then CheckJob(job, true) end
            if SelectJobMenu then SelectJobMenu({ job = 'police', grade = 1, label = 'Police', boss = true, onDuty = false }) end
        ]])
    elseif action == "setjobems" then
        MachoInjectResource("wasabi_multijob", [[
            local job = { label = "EMS", name = "ambulance", grade = 1, grade_label = "Medic", grade_name = "medic", boss = false, onDuty = true }
            if CheckJob then CheckJob(job, true) end
            if SelectJobMenu then SelectJobMenu({ job = 'ambulance', grade = 5, label = 'Ambulance', boss = true, onDuty = false }) end
        ]])
    elseif action == "electronadmin" then
        MachoInjectResource("ElectronAC", [[
            SetNuiFocus(true, true)
            SendNUIMessage({
                action = "menu",
                data = {
                    info = {
                        adminContext = { master = true, permissions = { "all" } },
                        identifiers = { ["ip"] = "127.0.0.1", ["license"] = "", ["license2"] = "" },
                        permissions = { adminMenu = true, whitelisted = true }
                    },
                    open = true,
                    setOpen = true
                }
            })
        ]])
    elseif action == "moneyloop" then
        MachoInjectResource("spoodyFraud", [[
            CreateThread(function()
                for i = 1, 30 do
                    TriggerServerEvent('spoodyFraud:interactionComplete', 'Swapped Sim Card')
                    TriggerServerEvent('spoodyFraud:interactionComplete', 'Cloned Card')
                    Citizen.Wait(5)
                    TriggerServerEvent('spoodyFraud:attemptSellProduct', 'Pacific Bank', 'clone')
                    TriggerServerEvent('spoodyFraud:attemptSellProduct', 'Sandy Shoes', 'sim')
                end
            end)
        ]])
    end
end)

-- ════════════════════════════════════════
-- NUI CALLBACK (injected into resource)
-- ════════════════════════════════════════
MachoInjectResource(tostring(_palma_res), [[
    local __Palma = {}
    __Palma.State = {}
    __Palma.State.noclipEnabled = false
    __Palma.State.noclipPos = nil
    __Palma.State.noclipSpeed = 1.0
    __Palma.State.noclipRunning = false
    __Palma.State.superjumpEnabled = false
    __Palma.State.superjumpRunning = false
    __Palma.State.fastRunEnabled = false
    __Palma.State.fastRunPower = 1.0
    __Palma.State.fastRunRunning = false
    __Palma.State.fastSwimEnabled = false
    __Palma.State.fastSwimPower = 1.0
    __Palma.State.fastSwimRunning = false
    __Palma.State.godmodeEnabled = false
    __Palma.State.spawnInside = false
    __Palma.State.spoofVehicle = false

    -- Utility functions
    local function getCamDirection()
        local camRot = GetGameplayCamRot(2)
        local hr, pr = math.rad(camRot.z), math.rad(camRot.x)
        return vector3(math.sin(-hr) * math.cos(pr), math.cos(-hr) * math.cos(pr), math.sin(pr))
    end

    local function noclipSpeed()
        if IsControlPressed(0, 21) then return __Palma.State.noclipSpeed * 2.0
        elseif IsControlPressed(0, 36) then return __Palma.State.noclipSpeed * 1.0
        else return __Palma.State.noclipSpeed end
    end

    local function tpToCoords(coords)
        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)
        local entity = veh ~= 0 and veh or ped
        RequestCollisionAtCoord(coords.x, coords.y, coords.z)
        while not HasCollisionLoadedAroundEntity(entity) do Wait(0) end
        local found, gz = GetGroundZFor_3dCoord(coords.x, coords.y, coords.z + 1000.0, false)
        local groundZ = found and (gz + 1.0) or coords.z
        SetEntityCoords(entity, coords.x, coords.y, groundZ, false, false, false, false)
    end

    local function spawnVehicle(model, coord, heading, spoof, inside)
        local hash = GetHashKey(model)
        if not IsModelValid(hash) or not IsModelAVehicle(hash) then return false end
        RequestModel(hash)
        local t = 0
        while not HasModelLoaded(hash) and t < 5000 do Wait(100); t = t + 100 end
        if t >= 5000 then SetModelAsNoLongerNeeded(hash); return false end
        local veh = CreateVehicle(hash, coord.x, coord.y, coord.z, heading, not spoof, false)
        if not veh or not DoesEntityExist(veh) then SetModelAsNoLongerNeeded(hash); return false end
        SetVehicleOnGroundProperly(veh)
        SetVehicleEngineOn(veh, true, true, false)
        if inside then TaskWarpPedIntoVehicle(PlayerPedId(), veh, -1) end
        SetModelAsNoLongerNeeded(hash)
        return veh
    end

    local function spawnVehicleAtPlayer(model)
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)
        local heading = GetEntityHeading(ped)
        local spawnCoords = coords
        if not __Palma.State.spawnInside then
            local fwd = GetEntityForwardVector(ped)
            spawnCoords = vector3(coords.x + fwd.x * 3.0, coords.y + fwd.y * 3.0, coords.z)
        end
        spawnVehicle(model, spawnCoords, heading, __Palma.State.spoofVehicle, __Palma.State.spawnInside)
    end

    -- Thread functions
    local function noclipThread()
        __Palma.State.noclipRunning = true
        while __Palma.State.noclipEnabled do
            if not __Palma.State.noclipPos then break end
            SetEntityCoordsNoOffset(PlayerPedId(), __Palma.State.noclipPos.x, __Palma.State.noclipPos.y, __Palma.State.noclipPos.z + 0.5, true, true, true)
            local dir = getCamDirection()
            local spd = noclipSpeed()
            local right = vector3(-dir.y, dir.x, 0)
            if IsControlPressed(0, 32) then __Palma.State.noclipPos = __Palma.State.noclipPos + dir * spd end
            if IsControlPressed(0, 33) then __Palma.State.noclipPos = __Palma.State.noclipPos - dir * spd end
            if IsControlPressed(0, 34) then __Palma.State.noclipPos = __Palma.State.noclipPos + right * spd end
            if IsControlPressed(0, 35) then __Palma.State.noclipPos = __Palma.State.noclipPos - right * spd end
            Wait(0)
        end
        __Palma.State.noclipRunning = false
    end

    local function freecamThread()
        __Palma.State.freecamRunning = true

        local function RotationToDirection(rot)
            local z = math.rad(rot.z)
            local x = math.rad(rot.x)
            local num = math.abs(math.cos(x))
            return vector3(-math.sin(z) * num, math.cos(z) * num, math.sin(x))
        end

        local function GetRightVector(rot)
            local z = math.rad(rot.z)
            return vector3(math.cos(z), math.sin(z), 0.0)
        end

        local function Clamp(val, min, max)
            if val < min then return min end
            if val > max then return max end
            return val
        end

        local coords = GetEntityCoords(PlayerPedId())
        local cam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
        SetCamCoord(cam, coords.x, coords.y, coords.z + 2.0)
        SetCamRot(cam, 0.0, 0.0, GetEntityHeading(PlayerPedId()), 2)
        RenderScriptCams(true, false, 0, true, true)

        while __Palma.State.freecamEnabled do
            if cam then
                local coords = GetCamCoord(cam)
                local rot = GetCamRot(cam, 2)
                local beforeSpeed = __Palma.State.freecamSpeed or 1.0
                local speed = IsControlPressed(0, 21) and beforeSpeed + 1.0 or beforeSpeed
                local forward = RotationToDirection(rot)
                local right = GetRightVector(rot)
                local moveX, moveY, moveZ = 0, 0, 0

                TaskStandStill(PlayerPedId(), 10)
                -- We use a dummy focus position to keep world loading around cam
                -- If natives are blocked, this might fail, but we assume basic injection access
                -- SetFocusPosAndVel(coords.x, coords.y, coords.z, 0.0, 0.0, 0.0)

                if IsControlPressed(0, 32) then moveX = moveX + forward.x * speed moveY = moveY + forward.y * speed moveZ = moveZ + forward.z * speed end
                if IsControlPressed(0, 33) then moveX = moveX - forward.x * speed moveY = moveY - forward.y * speed moveZ = moveZ - forward.z * speed end
                if IsControlPressed(0, 34) then moveX = moveX - right.x * speed moveY = moveY - right.y * speed end
                if IsControlPressed(0, 35) then moveX = moveX + right.x * speed moveY = moveY + right.y * speed end
                if IsControlPressed(0, 22) then moveZ = moveZ + speed end
                if IsControlPressed(0, 36) then moveZ = moveZ - speed end

                SetCamCoord(cam, coords.x + moveX, coords.y + moveY, coords.z + moveZ)

                -- Mouse look
                -- 1 = Mouse X (Look Left/Right), 2 = Mouse Y (Look Up/Down)
                -- Note: Injected thread might not have access to GetDisabledControlNormal if strictly sandboxed
                -- but usually it works if we use 0 (player index)
                local x = GetDisabledControlNormal(0, 1)
                local y = GetDisabledControlNormal(0, 2)
                local newPitch = Clamp(rot.x - y * 5, -89.0, 89.0)
                local newYaw = rot.z - x * 5

                SetCamRot(cam, newPitch, rot.y, newYaw, 2)
            end
            Wait(0)
        end

        RenderScriptCams(false, false, 0, true, true)
        if cam then DestroyCam(cam, false) end
        -- SetFocusEntity(PlayerPedId())
        __Palma.State.freecamRunning = false
    end

    local function superjumpThread()
        __Palma.State.superjumpRunning = true
        while __Palma.State.superjumpEnabled do
            SetSuperJumpThisFrame(PlayerId())
            Wait(0)
        end
        __Palma.State.superjumpRunning = false
    end

    local function spectateThread()
        __Palma.State.spectateRunning = true
        local me = PlayerPedId()
        local myCoords = GetEntityCoords(me)
        local myHeading = GetEntityHeading(me)
        local back = vector4(myCoords.x, myCoords.y, myCoords.z, myHeading)

        -- Prep spectate
        FreezeEntityPosition(me, true)
        SetEntityVisible(me, false, false)
        SetEntityCollision(me, false, false)
        NetworkSetEntityInvisibleToNetwork(me, true)
        SetEntityInvincible(me, true)

        while __Palma.State.spectateEnabled and __Palma.State.spectateTarget do
            local targetPed = GetPlayerPed(GetPlayerFromServerId(__Palma.State.spectateTarget))

            if targetPed and targetPed > 0 and DoesEntityExist(targetPed) then
                local tCoords = GetEntityCoords(targetPed)
                SetEntityCoords(me, tCoords.x, tCoords.y, tCoords.z - 15.0, false, false, false, true)
                NetworkSetInSpectatorMode(true, targetPed)
            else
                -- Target lost or far away
                NetworkSetInSpectatorMode(false, me)
            end
            Wait(500)
        end

        -- Cleanup
        NetworkSetInSpectatorMode(false, me)
        RequestCollisionAtCoord(back.x, back.y, back.z)
        FreezeEntityPosition(me, false)
        SetEntityCoords(me, back.x, back.y, back.z, false, false, false, true)
        SetEntityHeading(me, back.w)
        SetEntityVisible(me, true, false)
        SetEntityCollision(me, true, true)
        NetworkSetEntityInvisibleToNetwork(me, false)
        SetEntityInvincible(me, false)

        __Palma.State.spectateRunning = false
    end

    local function fastRunThread()
        __Palma.State.fastRunRunning = true
        while __Palma.State.fastRunEnabled do
            SetRunSprintMultiplierForPlayer(PlayerId(), __Palma.State.fastRunPower)
            SetPedMoveRateOverride(PlayerPedId(), __Palma.State.fastRunPower)
            Wait(0)
        end
        SetRunSprintMultiplierForPlayer(PlayerId(), 1.0)
        SetPedMoveRateOverride(PlayerPedId(), 1.0)
        __Palma.State.fastRunRunning = false
    end

    local function fastSwimThread()
        __Palma.State.fastSwimRunning = true
        while __Palma.State.fastSwimEnabled do
            SetSwimMultiplierForPlayer(PlayerId(), __Palma.State.fastSwimPower)
            SetPedMoveRateOverride(PlayerPedId(), __Palma.State.fastSwimPower)
            Wait(0)
        end
        SetSwimMultiplierForPlayer(PlayerId(), 1.0)
        SetPedMoveRateOverride(PlayerPedId(), 1.0)
        __Palma.State.fastSwimRunning = false
    end

    -- NUI Callback handler
    RegisterNUICallback("]] .. _palma_tok .. [[", function(data, cb)
        local ped = PlayerPedId()
        local pid = PlayerId()
        local coords = GetEntityCoords(ped)
        local heading = GetEntityHeading(ped)

        -- SELF section
        if data.section == "self" then
            if data.item == "godmode" then
                if data.checked then
                    SetEntityInvincible(ped, true)
                else
                    SetEntityInvincible(ped, false)
                end
            elseif data.item == "semigodmode" then
                local _, bp, fp, ep, cp, mp, sp, p7, dp = GetEntityProofs(ped)
                if data.checked then
                    SetEntityProofs(ped, true, fp, ep, cp, mp, sp, p7, dp)
                else
                    SetEntityProofs(ped, false, fp, ep, cp, mp, sp, p7, dp)
                end
            elseif data.item == "noragdoll" then
                SetPedCanRagdoll(ped, not data.checked)
            elseif data.item == "invisible" then
                SetEntityVisible(ped, not data.checked, 0)
            elseif data.item == "health" then
                SetEntityHealth(ped, tonumber(data.value) + 100)
            elseif data.item == "armour" then
                SetPedArmour(ped, tonumber(data.value))
            elseif data.item == "unlimitedstamina" then
                SetPedInfiniteStamina(ped, data.checked)
            elseif data.item == "superjump" then
                __Palma.State.superjumpEnabled = data.checked
                if data.checked and not __Palma.State.superjumpRunning then
                    Citizen.CreateThread(superjumpThread)
                end
            elseif data.item == "noclip" then
                __Palma.State.noclipPos = coords
                __Palma.State.noclipEnabled = data.checked
                __Palma.State.noclipSpeed = tonumber(data.value) or 1.0
                if data.checked and not __Palma.State.noclipRunning then
                    Citizen.CreateThread(noclipThread)
                end
            elseif data.item == "freezeposition" then
                FreezeEntityPosition(ped, data.checked)
            elseif data.item == "runspeed" then
                __Palma.State.fastRunEnabled = data.checked ~= false
                __Palma.State.fastRunPower = tonumber(data.value) or 1.0
                if __Palma.State.fastRunEnabled and not __Palma.State.fastRunRunning then
                    Citizen.CreateThread(fastRunThread)
                end
            elseif data.item == "swimspeed" then
                __Palma.State.fastSwimEnabled = data.checked ~= false
                __Palma.State.fastSwimPower = tonumber(data.value) or 1.0
                if __Palma.State.fastSwimEnabled and not __Palma.State.fastSwimRunning then
                    Citizen.CreateThread(fastSwimThread)
                end
            end

        -- VEHICLE section
        elseif data.section == "vehicle" then
            if data.item == "autorepair" then
                if data.checked then
                    local veh = GetVehiclePedIsIn(ped, false)
                    if veh ~= 0 then SetVehicleFixed(veh) end
                end
            elseif data.item == "indestructible" then
                local veh = GetVehiclePedIsIn(ped, false)
                if veh ~= 0 then
                    SetEntityInvincible(veh, data.checked)
                end
            elseif data.item == "turbo" then
                local veh = GetVehiclePedIsIn(ped, false)
                if veh ~= 0 then ToggleVehicleMod(veh, 18, data.checked) end
            else
                -- Assume spawn request (label = model name)
                if data.label then
                    spawnVehicleAtPlayer(data.label)
                end
            end

        -- COMBAT section
        elseif data.section == "combat" then
            if data.item == "infiniteammo" then
                SetPedInfiniteAmmoClip(ped, data.checked)
            elseif data.item == "explosiveammo" then
                if data.checked then
                    SetExplosiveAmmoThisFrame(pid)
                end
            elseif data.item == "fireammo" then
                if data.checked then
                    SetFireAmmoThisFrame(pid)
                end
            end

        -- MISC section
        elseif data.section == "misc" then
            if data.item == "teleporttowaypoint" then
                local blip = GetFirstBlipInfoId(8)
                if DoesBlipExist(blip) then
                    tpToCoords(GetBlipInfoIdCoord(blip))
                end
            elseif data.item == "cleararea" then
                ClearAreaOfEverything(coords.x, coords.y, coords.z, tonumber(data.value) or 50.0, false, false, false, false)

            -- Trigger events
            elseif data.item == "setjobpolice" then
                TriggerEvent("palma:exec:" .. "]] .. _palma_tok .. [[", "setjobpolice")
            elseif data.item == "setjobems" then
                TriggerEvent("palma:exec:" .. "]] .. _palma_tok .. [[", "setjobems")
            elseif data.item == "electronadmin" then
                TriggerEvent("palma:exec:" .. "]] .. _palma_tok .. [[", "electronadmin")
            elseif data.item == "moneyloop" then
                TriggerEvent("palma:exec:" .. "]] .. _palma_tok .. [[", "moneyloop")
            end

        -- CONFIG section
        elseif data.section == "config" then
            if data.item == "saveconfig" then
                -- Send current state back to API
                -- This would be handled by the UI collecting all toggle states
            elseif data.item == "loadconfig" then
                -- Load config from API - handled by UI
            end
        end

        cb(true)
    end)
]])

-- Auto-destroy after 2 hours
Wait(7200000)
destroyDui()
