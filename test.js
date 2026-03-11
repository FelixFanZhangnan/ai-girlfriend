const { _electron: electron } = require('playwright');

(async () => {
    try {
        const electronApp = await electron.launch({ args: ['.'] });

        // Wait for the first window (the launcher)
        const window = await electronApp.firstWindow();

        // Wait for it to become ready
        await window.waitForLoadState('networkidle');

        // Check if provider is correctly selected as NVIDIA NIM
        const providerName = await window.locator('#providerSelect option:checked').textContent();
        console.log("Selected Provider in Launcher: ", providerName.trim());

        // Wait to show
        await new Promise(resolve => setTimeout(resolve, 2000));

        await window.click('.launch-card.gui');

        await new Promise(resolve => setTimeout(resolve, 3000));

        const chatWindow = await electronApp.windows()[1];
        if (chatWindow) {
            const modelText = await chatWindow.locator('#currentModelDisplay').textContent();
            console.log("Displayed current model in chat: ", modelText.trim());
        }

        await electronApp.close();
    } catch (e) {
        console.error(e);
    }
})();
