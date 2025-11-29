module.exports = {
    packagerConfig: {
        icon: './icon' // Assumes icon.icns exists, but we might not have it.
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
        {
            name: '@electron-forge/maker-dmg',
            config: {
                format: 'ULFO'
            }
        }
    ],
};
