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
local _palma_res, _palma_ac_res, _palma_tok, _palma_locked = nil, nil, math.random(10000000, 99999999), false
local _palma_categories = {}

-- ════════════════════════════════════════
-- ENCRYPTION
-- ════════════════════════════════════════
local function xorStr(str, key)
    local out = {}
    for i = 1, #str do
        local ki = ((i - 1) % #key) + 1
        out[i] = string.char(bit32.bxor(string.byte(str, i), string.byte(key, ki)))
    end
    return table.concat(out)
end

local function rot(str, shift)
    shift = shift or 3
    local out = {}
    for i = 1, #str do
        local v = string.byte(str, i)
        out[i] = string.char(bit32.bor(bit32.band(bit32.lshift(v, shift), 0xFF), bit32.band(bit32.rshift(v, 8 - shift), 0xFF)))
    end
    return table.concat(out)
end

local function b64Encode(str)
    local b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    return ((str:gsub('.', function(x)
        local r, b2 = '', x:byte()
        for i = 8, 1, -1 do r = r .. (b2 % 2 ^ i - b2 % 2 ^ (i - 1) > 0 and '1' or '0') end
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
-- NOTIFICATIONS
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
            local cs_raw, cs_single = getMeta(name, "client_scripts", 0), getMeta(name, "client_script", 0)
            _palma_categories[name] = {
                fxap = LoadResourceFile(name, ".fxap") ~= nil,
                ui_page = ui_page and ui_page ~= "",
                map = getMeta(name, "this_is_a_map", 0) == "yes",
                lua54 = getMeta(name, "lua54", 0) == "yes",
                loadscreen = (getMeta(name, "loadscreen_cursor", 0) == "yes" or getMeta(name, "loadscreen_manual_shutdown", 0) == "yes"),
                client = (cs_raw ~= "" and cs_raw ~= "[]" and cs_raw ~= "{}") or (cs_single ~= "" and cs_single ~= "[]" and cs_single ~= "{}"),
                ac_on = name == "LifeShield" or name == "WaveShield" or getMeta(name, "ac", 0) == "fg" or LoadResourceFile(name, "cl-resource-obfuscated.lua") ~= nil
            }
        end
        Wait(0)
    end
    cb()
end

local function filterResources(fxap, ui_page, lua54, client, map, loadscreen, ac_on)
    local matches, priorityGroups = {}, {}
    for name, data in pairs(_palma_categories) do
        local ok = true
        if fxap ~= nil and data.fxap ~= fxap then ok = false end
        if ui_page ~= nil and data.ui_page ~= ui_page then ok = false end
        if map ~= nil and data.map ~= map then ok = false end
        if lua54 ~= nil and data.lua54 ~= lua54 then ok = false end
        if loadscreen ~= nil and data.loadscreen ~= loadscreen then ok = false end
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

categorizeResources(function()
    Wait(1500)
    _palma_res = filterResources(nil, true, nil, true, false, false) or "any"
    _palma_ac_res = filterResources(false, false, true, false, false, false, true)
    if not _palma_res then
        sendNotification("error", nil, "Injection failed, please try again...", 10000)
        _palma_locked = true
    end
end)

local _palma_auth_key = MachoAuthenticationKey()

Wait(4000)
while _palma_res == nil and not _palma_locked do Wait(500) end
if _palma_locked then
    Citizen.CreateThread(function() Wait(10000); destroyDui() end)
    return false
end

if _palma_ac_res then
    sendNotification("info", nil, "Anti-cheat detected [" .. _palma_ac_res .. "]...", 7000)
else
    sendNotification("error", nil, "No known anti-cheat detected.", 7000)
end

sendNotification("default", nil, "Bypasses loaded...", 5000)
Wait(2000)

-- Player update loop
Citizen.CreateThread(function()
    while true do
        local players = GetActivePlayers()
        local data = {}
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)

        for _, id in ipairs(players) do
            local targetPed = GetPlayerPed(id)
            if DoesEntityExist(targetPed) then
                local tCoords = GetEntityCoords(targetPed)
                local dist = #(coords - tCoords)

                table.insert(data, {
                    serverID = GetPlayerServerId(id),
                    name = GetPlayerName(id),
                    health = GetEntityHealth(targetPed),
                    armor = GetPedArmour(targetPed),
                    dist = dist
                })
            end
        end

        MachoSendDuiMessage(_palma_dui, json.encode({
            action = "update-players",
            data = data
        }))

        Wait(3000)
    end
end)

local function fetchUserInfo()
    local payload = encryptPayload({ api_key = PALMA_API_KEY, auth_key = _palma_auth_key })
    local encoded = payload:gsub("+", "%%2B"):gsub("/", "%%2F"):gsub("=", "%%3D")
    local url = PALMA_API_BASE .. "/user-info?data=" .. encoded
    local response = MachoWebRequest(url)
    if response and response ~= "" then
        MachoSendDuiMessage(_palma_dui, json.encode({ action = "user-info-encrypted", data = response }))
    end
end

fetchUserInfo()

local function fetchConfigs()
    local url = PALMA_API_BASE .. "/api/configs?macho_key=" .. (_palma_auth_key or "")
    local response = MachoWebRequest(url)
    if response and response ~= "" then
        MachoSendDuiMessage(_palma_dui, json.encode({action = "load-configs", data = response}))
    end
end

local function fetchScripts()
    local url = PALMA_API_BASE .. "/api/scripts?macho_key=" .. (_palma_auth_key or "")
    local response = MachoWebRequest(url)
    if response and response ~= "" then
        MachoSendDuiMessage(_palma_dui, json.encode({action = "load-scripts", data = response}))
    end
end

fetchConfigs()
fetchScripts()

sendNotification("success", nil, "Palma Menu is now ready to use...", 5000)
MachoSetLoggerState(0)
MachoLockLogger(1)
Wait(4000)

MachoSendDuiMessage(_palma_dui, json.encode({ action = "send-endpoint", value = "https://" .. _palma_res .. "/" .. _palma_tok .. "/" }))
MachoSendDuiMessage(_palma_dui, json.encode({ action = "set-auth-key", value = _palma_auth_key }))

Citizen.CreateThread(function()
    local function sendKey(key, value, keyType)
        MachoSendDuiMessage(_palma_dui, json.encode({ action = "keyboard", key = key, value = value, keyType = keyType }))
    end
    local keyMap = { [0x08]="Backspace", [0x09]="Tab", [0x0D]="Enter", [0x1B]="Escape", [0x20]="Space", [0x21]="PageUp", [0x22]="PageDown", [0x23]="End", [0x24]="Home", [0x25]="ArrowLeft", [0x26]="ArrowUp", [0x27]="ArrowRight", [0x28]="ArrowDown", [0x2E]="Delete", [0x30]="0", [0x31]="1", [0x32]="2", [0x33]="3", [0x34]="4", [0x35]="5", [0x36]="6", [0x37]="7", [0x38]="8", [0x39]="9", [0x41]="A", [0x42]="B", [0x43]="C", [0x44]="D", [0x45]="E", [0x46]="F", [0x47]="G", [0x48]="H", [0x49]="I", [0x4A]="J", [0x4B]="K", [0x4C]="L", [0x4D]="M", [0x4E]="N", [0x4F]="O", [0x50]="P", [0x51]="Q", [0x52]="R", [0x53]="S", [0x54]="T", [0x55]="U", [0x56]="V", [0x57]="W", [0x58]="X", [0x59]="Y", [0x5A]="Z", [0x70]="F1", [0x71]="F2", [0x72]="F3", [0x73]="F4", [0x74]="F5", [0x75]="F6", [0x76]="F7", [0x77]="F8", [0x78]="F9", [0x79]="F10", [0x7A]="F11", [0x7B]="F12", [0xBA]=";", [0xBB]="=", [0xBC]=",", [0xBD]="-", [0xBE]=".", [0xBF]="/", [0xC0]="`", [0xDB]="[", [0xDC]="\\", [0xDD]="]", [0xDE]="'" }
    MachoOnKeyDown(function(vk)
        local keyName = keyMap[vk]
        if keyName then
            local keyType = "navigation"
            if vk >= 0x30 and vk <= 0x39 then keyType = "number"
            elseif vk >= 0x41 and vk <= 0x5A then keyType = "letter"
            elseif vk >= 0x70 and vk <= 0x7B then keyType = "function"
            elseif vk == 0x20 then keyType = "space"
            elseif vk == 0x08 or vk == 0x2E then keyType = "edit"
            elseif vk == 0x0D then keyType = "enter"
            elseif vk == 0x1B then keyType = "escape"
            elseif vk >= 0x25 and vk <= 0x28 then keyType = "arrow" end
            sendKey(keyName, vk, keyType)
        end
    end)
end)

-- ════════════════════════════════════════
-- NUI CALLBACK (injected into resource)
-- ════════════════════════════════════════
MachoInjectResource(tostring(_palma_res), [[
    local __Palma = {}
    __Palma.State = {}
    __Palma.State.selectedPlayer = nil
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
    __Palma.State.freecamEnabled = false
    __Palma.State.freecamRunning = false
    __Palma.State.spectateEnabled = false

    -- Weapon Mapping
    local WeaponMap = {
        ["Assault Rifle"] = "WEAPON_ASSAULTRIFLE",
        ["Carbine Rifle"] = "WEAPON_CARBINERIFLE",
        ["Advanced Rifle"] = "WEAPON_ADVANCEDRIFLE",
        ["Special Carbine"] = "WEAPON_SPECIALCARBINE",
        ["Pistol"] = "WEAPON_PISTOL",
        ["Combat Pistol"] = "WEAPON_COMBATPISTOL",
        ["Heavy Pistol"] = "WEAPON_HEAVYPISTOL",
        ["Vintage Pistol"] = "WEAPON_VINTAGEPISTOL",
        ["Pump Shotgun"] = "WEAPON_PUMPSHOTGUN",
        ["Assault Shotgun"] = "WEAPON_ASSAULTSHOTGUN",
        ["Heavy Shotgun"] = "WEAPON_HEAVYSHOTGUN",
        ["Knife"] = "WEAPON_KNIFE",
        ["Bat"] = "WEAPON_BAT",
        ["Crowbar"] = "WEAPON_CROWBAR",
        ["Golf Club"] = "WEAPON_GOLFCLUB"
    }

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

    local function GetPlayerPedFromServerId(serverId)
        local playerId = GetPlayerFromServerId(serverId)
        if playerId == -1 then return 0 end
        return GetPlayerPed(playerId)
    end

    local function Spectate(targetServerId)
        local targetPed = GetPlayerPedFromServerId(targetServerId)
        if not DoesEntityExist(targetPed) then return end

        if __Palma.State.spectateEnabled then
            NetworkSetInSpectatorMode(true, targetPed)
        else
            NetworkSetInSpectatorMode(false, targetPed)
        end
    end

    -- Freecam Logic
    local function freecamThread()
        __Palma.State.freecamRunning = true
        local cam = CreateCam("DEFAULT_SCRIPTED_CAMERA", true)
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)
        SetCamCoord(cam, coords.x, coords.y, coords.z)
        SetCamRot(cam, 0.0, 0.0, 0.0, 2)
        SetCamActive(cam, true)
        RenderScriptCams(true, false, 0, true, true)

        while __Palma.State.freecamEnabled do
            local camCoords = GetCamCoord(cam)
            local camRot = GetCamRot(cam, 2)
            local speed = 1.0
            if IsControlPressed(0, 21) then speed = 2.0 end -- Shift

            -- Rotation
            local x = GetDisabledControlNormal(0, 1)
            local y = GetDisabledControlNormal(0, 2)
            local newPitch = camRot.x - y * 5
            local newYaw = camRot.z - x * 5
            SetCamRot(cam, newPitch, 0.0, newYaw, 2)

            -- Movement logic simplified
            local vecX, vecY, vecZ = 0, 0, 0
            local radZ = math.rad(newYaw)
            local radX = math.rad(newPitch)

            -- Forward vector
            local dx = -math.sin(radZ) * math.abs(math.cos(radX))
            local dy = math.cos(radZ) * math.abs(math.cos(radX))
            local dz = math.sin(radX)

            if IsControlPressed(0, 32) then -- W
                vecX = vecX + dx * speed
                vecY = vecY + dy * speed
                vecZ = vecZ + dz * speed
            end
            if IsControlPressed(0, 33) then -- S
                vecX = vecX - dx * speed
                vecY = vecY - dy * speed
                vecZ = vecZ - dz * speed
            end

            SetCamCoord(cam, camCoords.x + vecX, camCoords.y + vecY, camCoords.z + vecZ)
            Wait(0)
        end

        RenderScriptCams(false, false, 0, true, true)
        DestroyCam(cam, false)
        __Palma.State.freecamRunning = false
    end

    -- Threads
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

    local function superjumpThread()
        __Palma.State.superjumpRunning = true
        while __Palma.State.superjumpEnabled do
            SetSuperJumpThisFrame(PlayerId())
            Wait(0)
        end
        __Palma.State.superjumpRunning = false
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

        -- PLAYER SELECTION
        if data.item == "selectplayer" then
            __Palma.State.selectedPlayer = tonumber(data.value)
            cb(true)
            return
        end

        -- PLAYERS section
        if data.section == "players" then
            if not __Palma.State.selectedPlayer then return end
            if data.item == "spectate" then
                -- Note: Logic inverted or simple toggle? UI sends "button", not checkbox usually for this in interactions
                -- But if it's a toggle button? Let's assume it's an action
                __Palma.State.spectateEnabled = not __Palma.State.spectateEnabled
                Spectate(__Palma.State.selectedPlayer)
            elseif data.item == "teleportto" then
                local targetPed = GetPlayerPedFromServerId(__Palma.State.selectedPlayer)
                if DoesEntityExist(targetPed) then
                    local tCoords = GetEntityCoords(targetPed)
                    tpToCoords(tCoords)
                end
            end

        -- SELF section
        elseif data.section == "self" then
            if data.item == "godmode" then
                SetEntityInvincible(ped, data.checked)
            elseif data.item == "semigodmode" then
                local _, bp, fp, ep, cp, mp, sp, p7, dp = GetEntityProofs(ped)
                if data.checked then SetEntityProofs(ped, true, fp, ep, cp, mp, sp, p7, dp)
                else SetEntityProofs(ped, false, fp, ep, cp, mp, sp, p7, dp) end
            elseif data.item == "noragdoll" then
                SetPedCanRagdoll(ped, not data.checked)
            elseif data.item == "invisible" then
                SetEntityVisible(ped, not data.checked, 0)
            elseif data.item == "health" then
                SetEntityHealth(ped, tonumber(data.value))
            elseif data.item == "armour" then
                SetPedArmour(ped, tonumber(data.value))
            elseif data.item == "unlimitedstamina" then
                SetPedInfiniteStamina(ped, data.checked)
            elseif data.item == "superjump" then
                __Palma.State.superjumpEnabled = data.checked
                if data.checked and not __Palma.State.superjumpRunning then Citizen.CreateThread(superjumpThread) end
            elseif data.item == "noclip" then
                __Palma.State.noclipPos = coords
                __Palma.State.noclipEnabled = data.checked
                __Palma.State.noclipSpeed = tonumber(data.value) or 1.0
                if data.checked and not __Palma.State.noclipRunning then Citizen.CreateThread(noclipThread) end
            elseif data.item == "freezeposition" then
                FreezeEntityPosition(ped, data.checked)
            elseif data.item == "runspeed" then
                __Palma.State.fastRunEnabled = data.checked ~= false
                __Palma.State.fastRunPower = tonumber(data.value) or 1.0
                if __Palma.State.fastRunEnabled and not __Palma.State.fastRunRunning then Citizen.CreateThread(fastRunThread) end
            elseif data.item == "swimspeed" then
                __Palma.State.fastSwimEnabled = data.checked ~= false
                __Palma.State.fastSwimPower = tonumber(data.value) or 1.0
                if __Palma.State.fastSwimEnabled and not __Palma.State.fastSwimRunning then Citizen.CreateThread(fastSwimThread) end
            end

        -- VEHICLE section
        elseif data.section == "vehicle" then
            if data.item == "spawnvehicle" then
                spawnVehicleAtPlayer(data.value)
            elseif data.item == "autorepair" then
                if data.checked then
                    local veh = GetVehiclePedIsIn(ped, false)
                    if veh ~= 0 then SetVehicleFixed(veh) end
                end
            elseif data.item == "indestructible" then
                local veh = GetVehiclePedIsIn(ped, false)
                if veh ~= 0 then SetEntityInvincible(veh, data.checked) end
            elseif data.item == "turbo" then
                local veh = GetVehiclePedIsIn(ped, false)
                if veh ~= 0 then ToggleVehicleMod(veh, 18, data.checked) end
            end

        -- COMBAT section
        elseif data.section == "combat" then
            if data.item == "infiniteammo" then
                SetPedInfiniteAmmoClip(ped, data.checked)
            elseif data.item == "explosiveammo" then
                if data.checked then SetExplosiveAmmoThisFrame(pid) end
            elseif data.item == "fireammo" then
                if data.checked then SetFireAmmoThisFrame(pid) end
            elseif data.item == "spawnweapon" then
                local weaponName = data.label
                local hash = WeaponMap[weaponName]
                if hash then
                    GiveWeaponToPed(ped, GetHashKey(hash), 999, false, true)
                end
            end

        -- MISC section
        elseif data.section == "misc" then
            if data.item == "teleporttowaypoint" then
                local blip = GetFirstBlipInfoId(8)
                if DoesBlipExist(blip) then tpToCoords(GetBlipInfoIdCoord(blip)) end
            elseif data.item == "cleararea" then
                ClearAreaOfEverything(coords.x, coords.y, coords.z, tonumber(data.value) or 50.0, false, false, false, false)
            elseif data.item == "enablefreecam" then
                __Palma.State.freecamEnabled = data.checked
                if data.checked and not __Palma.State.freecamRunning then
                    Citizen.CreateThread(freecamThread)
                end
            end

        -- CONFIG section
        elseif data.section == "config" then
            if data.item == "saveconfig" then
                -- handled by UI
            elseif data.item == "loadconfig" then
                -- handled by UI
            end
        end

        cb(true)
    end)
]])

-- Auto-destroy after 2 hours
Wait(7200000)
destroyDui()
