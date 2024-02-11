module.exports.dependencies = ['axios'];

const details = () => ({
    id: 'Tdarr_Plugin_yodog_add_to_radarr_or_sonarr',
    Stage: 'Post-processing',
    Name: 'Add media to Radarr and/or Sonarr',
    Type: 'Video',
    Operation: 'Transcode',
    Description: 'This plugin will try to add the media to Radarr and Sonarr. It will not fail your stack if unsuccessful.',
    Version: '2024.02.11.0343',
    Tags: '3rd party,post-processing,configurable',
    Inputs: [
        {
            name: 'radarr_enabled',
            type: 'boolean',
            defaultValue: false,
            inputUI: {type: 'dropdown', options: ['false', 'true']},
            tooltip: 'try to use radarr',
        },
        {
            name: 'radarr_server',
            type: 'string',
            defaultValue: '192.168.100.39',
            inputUI: {type: 'text'},
            tooltip: `
                Enter the server address \\n
                Example: 192.168.100.39
            `,
        },
        {
            name: 'radarr_port',
            type: 'string',
            defaultValue: '7878',
            inputUI: {type: 'text'},
            tooltip: `
                Enter the port Radarr is using \\n
                Example: 7878
            `,
        },
        {
            name: 'radarr_api_key',
            type: 'string',
            defaultValue: '066e4929b5bb4cda8e46e4fbe2e82b9e',
            inputUI: {type: 'text'},
            tooltip: `
                Enter the Radarr API key \\n
                Example: 066e4929b5bb4cda8e46e4fbe2e82b9e
            `,
        },
        {
            name: 'sonarr_enabled',
            type: 'boolean',
            defaultValue: false,
            inputUI: {type: 'dropdown', options: ['false', 'true']},
            tooltip: 'try to use sonarr',
        },
        {
            name: 'sonarr_server',
            type: 'string',
            defaultValue: '192.168.100.39',
            inputUI: {type: 'text'},
            tooltip: `
                Enter the server address \\n
                Example: 192.168.100.39
            `,
        },
        {
            name: 'sonarr_port',
            type: 'string',
            defaultValue: '8989',
            inputUI: {type: 'text'},
            tooltip: `
                Enter the port sonarr is using \\n
                Example: 8989
            `,
        },
        {
            name: 'sonarr_api_key',
            type: 'string',
            defaultValue: 'd5ea862d129449c6a6557f632142152a',
            inputUI: {type: 'text'},
            tooltip: `
                Enter the sonarr API key \\n
                Example: d5ea862d129449c6a6557f632142152a
            `,
        },
    ],
});



const mylog = [];



const response = {
    processFile: false,
    infoLog: ''
};



const plugin = async (file, librarySettings, inputs, otherArguments) => {

    // ---
    // plugin libs and required npm packages
    // ---

    const lib = require('../methods/lib')();
    inputs = lib.loadDefaultValues(inputs, details);
    const axios = require('axios').default;

    // ---
    // setup
    // ---

    const fileNameEncoded = encodeURIComponent(file.meta.FileName);
    const radarr_url_srch = `http://${inputs.radarr_server}:${inputs.radarr_port}/api/v3/parse?apikey=${inputs.radarr_api_key}&title=${fileNameEncoded}`;
    const sonarr_url_srch = `http://${inputs.sonarr_server}:${inputs.sonarr_port}/api/v3/parse?apikey=${inputs.sonarr_api_key}&title=${fileNameEncoded}`;
    const radarr_url_post = `http://${inputs.radarr_server}:${inputs.radarr_port}/api/v3/command?apikey=${inputs.radarr_api_key}`;
    const sonarr_url_post = `http://${inputs.sonarr_server}:${inputs.sonarr_port}/api/v3/command?apikey=${inputs.sonarr_api_key}`;

    // ---
    // lets start the radarr flow if enabled
    // ---

    if (inputs.radarr_enabled) {
        mylog.push('radarr -> enabled in the plugin config');
        radarrResult = await axios.get(radarr_url_srch).then((resp) => resp).catch((error) => error);
        console.log('radarrResult', radarrResult);

        if (radarrResult.data.movie) {
            movieId = radarrResult.data.movie.id;
            movieTitle = radarrResult.data.movie.title;
            mylog.push(`radarr -> found movie with id ${movieId} and title ${movieTitle}`);

            await axios.post(radarr_url_post, {name: 'RefreshMovie', movieIds: [movieId]})
                .then((response) => {
                    mylog.push(`radarr -> ${response.data.commandName} ${movieId} ${response.data.status}`);
                    console.log('response -->', response);
                })
                .catch((error) => {
                    mylog.push(`radarr -> could not update movie id ${movieId}`);
                    console.log('error -->', error);
                });
        }
        else {
            mylog.push(`radarr -> movie not found`);
        }
    }
    else {
        mylog.push('radarr -> disabled in the plugin config');
    }

    // ---
    // now the sonnar flow if enabled
    // ---

    if (inputs.sonarr_enabled) {
        mylog.push('sonnar -> enabled in the plugin config');
        sonarrResult = (await axios.get(sonarr_url_srch).then((resp) => resp.data));
        console.log('sonarrResult', sonarrResult);

        if (sonarrResult.series) {
            seriesId = sonarrResult.series.id;
            seriesTitle = sonarrResult.series.title;
            mylog.push(`sonarr -> found series with id ${seriesId} and title ${seriesTitle}`);

            await axios.post(sonarr_url_post, {name: 'RefreshSeries', seriesId: seriesId})
                .then((response) => {
                    mylog.push(`sonarr -> ${response.data.commandName} ${seriesId} ${response.data.status}`);
                    console.log('response -->', response);
                })
                .catch((error) => {
                    mylog.push(`sonarr -> could not update series id ${seriesId}`);
                    console.log('error -->', error);
                });
        }
        else {
            mylog.push(`sonarr -> series not found`);
        }
    }
    else {
        mylog.push('sonnar -> disabled in the plugin config');
    }

    // ---
    // return the response and we are done
    // ---

    response.infoLog += mylog.join('\n');
    return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
