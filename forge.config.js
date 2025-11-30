module.exports = {
    packagerConfig: {
        icon: './icon',
        extraResource: [
            './iconTemplate.svg',
            './iconRecordingTemplate.svg'
        ]
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
