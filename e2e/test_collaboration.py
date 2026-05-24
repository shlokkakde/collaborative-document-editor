import os
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def test_two_browser_windows_sync_document_edits():
    first = webdriver.Chrome()
    second = webdriver.Chrome()
    wait = WebDriverWait(first, 15)
    second_wait = WebDriverWait(second, 15)

    try:
        first.get(FRONTEND_URL)
        wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='new-document']"))).click()
        editor = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='editor']")))
        editor.send_keys("Hello from browser one")

        document_id = first.current_url.rstrip("/").split("/")[-1]
        second.get(f"{FRONTEND_URL}/documents/{document_id}")
        second_editor = second_wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='editor']"))
        )

        deadline = time.time() + 10
        while time.time() < deadline:
            if "Hello from browser one" in second_editor.get_attribute("value"):
                break
            time.sleep(0.25)
        assert "Hello from browser one" in second_editor.get_attribute("value")

        second_editor.send_keys(Keys.ENTER, "Hello back from browser two")
        deadline = time.time() + 10
        while time.time() < deadline:
            if "Hello back from browser two" in editor.get_attribute("value"):
                break
            time.sleep(0.25)
        assert "Hello back from browser two" in editor.get_attribute("value")
    finally:
        first.quit()
        second.quit()
