from playwright.sync_api import sync_playwright
import time

def verify_frontend():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the local server
        page.goto("http://localhost:8080/index.html")

        # 1. Verify Init Screen & Load
        print("Verifying Init Screen...")
        page.wait_for_selector("#initScreen")

        # Simulate setting a keybind (e.g., 'K')
        keybind_input = page.locator("#initKeybindInput")
        keybind_input.click()
        page.keyboard.press("k")

        # Click Load Menu
        page.click("#initLoadButton")

        # Wait for menu to appear
        page.wait_for_selector("#palmaMenu", state="visible")

        # 2. Navigate to Triggers Section (Misc -> Triggers)
        print("Navigating to Triggers...")
        # Misc is index 5
        misc_nav = page.locator(".palma-nav-item").nth(5)
        misc_nav.click()

        # Wait for landing page text to confirm we are in Misc
        # Default category is 'Destroyer' (index 0)
        # We need 'Triggers' (index 2)
        # Press ArrowRight twice
        page.keyboard.press("ArrowRight")
        page.keyboard.press("ArrowRight")

        # Now press Enter to enter Level 2 (Items view)
        page.keyboard.press("Enter")

        # Wait for items to populate
        page.wait_for_selector(".palma-item")

        # 3. Verify Specific Buttons from Plan
        print("Verifying Trigger Buttons...")
        expected_buttons = [
            "Set Job Police",
            "Set Job EMS",
            "Electron Admin",
            "Money Loop",
            "Custom Trigger"
        ]

        found_count = 0
        for btn_label in expected_buttons:
            # Use a more specific locator to avoid false positives in hidden sections
            if page.locator(f".palma-item-label:text-is('{btn_label}')").count() > 0:
                print(f"✅ Found button: {btn_label}")
                found_count += 1
            else:
                print(f"❌ Missing button: {btn_label}")

        if found_count == len(expected_buttons):
            print("All trigger buttons verified.")
        else:
            print(f"Failed to verify all buttons. Found {found_count}/{len(expected_buttons)}")

        # 4. Navigate to Vehicle Section
        print("Navigating to Vehicle...")
        # Vehicle is index 3
        veh_nav = page.locator(".palma-nav-item").nth(3)
        veh_nav.click()

        # Default category is Spawner (index 0). Press Enter to enter it.
        page.keyboard.press("Enter")

        # Verify a specific vehicle button exists (e.g. "Adder") to confirm list populated
        # Note: Vehicle spawner has submenus (Sports, etc.)
        # So we see "Sports", "SUVs", "Motorcycles"
        page.wait_for_selector(".palma-item")

        # Take verification screenshot
        page.screenshot(path="verification_frontend.png")
        print("Screenshot saved to verification_frontend.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
