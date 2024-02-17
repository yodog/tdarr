// dependencias
const dependencies = ['child_process', 'import-fresh'];

// detalhes
const details = () => ({
    id: "Tdarr_Plugin_yodog_scale_and_transcode",
    Name: "Tdarr_Plugin_yodog_scale_and_transcode",
    Stage: 'Pre-processing',
    Type: "Video",
    Operation: "Transcode",
    Version: "2024.02.17.1545",
    Tags: 'configurable,ffmpeg,h265/hevc,nvenc,pre-processing',
    Description: `
        - this script will:
            * automatically search for a working GPU encoder and fallback to CPU if not found
            * accept a min and max resolution so any video not in this range will be upscaled or downscaled (optional)
            * transcode video to hevc/h265
            * transcode audio to AAC 192k stereo
            * remux container to mp4

        - user options:
            * set filter to exclude some codecs from processing (optional, default: empty)
            * set max resolution to downscale big videos (optional, default: -1)
            * set min resolution to upscale small videos (optional, default: -1)
            * set compression ratio [video quality] (required, default: 25)
        
        - what is checked before transcoding:
            * file is video (skip if false)
            * file codec is in exclude list (skip if true)
            * file resolution is between min resolution and max resolution (skip if true)
    `,
    Inputs: [
        {
            name: 'exclude_codecs',
            type: 'string',
            defaultValue: '',
            inputUI: {type: 'text'},
            tooltip: `
                List of codecs that should not be processed \\n
                Example: h264,hevc
            `,
        },
        {
            name: 'min_resolution',
            type: 'number',
            defaultValue: '-1',
            inputUI: {type: 'text'},
            tooltip: `
                Videos with a resolution smaller than this value will be upscaled to this value \\n
                -1   to disable and maintain the original \\n
                720  to upscale to 720p \\n
                1080 to upscale to 1080p \\n
                etc
            `,
        },
        {
            name: 'max_resolution',
            type: 'number',
            defaultValue: '-1',
            inputUI: {type: 'text'},
            tooltip: `
                Videos with a resolution bigger than this value will be downscaled to this value \\n
                -1   to disable and maintain the original \\n
                720  to downscale to 720p \\n
                1080 to downscale to 1080p \\n
                etc
            `,
        },
        {
            name: 'crf',
            type: 'number',
            defaultValue: '25',
            inputUI: {type: 'text'},
            tooltip: `
                How much compression is applied to the video \\n
                Minimum: 0  (high quality) \\n
                Maximum: 51 (low quality)
            `,
        },
        {
            name: 'acodec',
            type: 'string',
            defaultValue: 'aac -ac 2 -b:a 192k',
            inputUI: {type: 'text'},
            tooltip: `
                Audio enconding settings to be passed to '-acodec' \\n
                Example: 'aac -ac 2 -b:a 192k' for AAC 2 chanels 192k bitrate
            `,
        },
    ],
});

// valores iniciais. deve ser retornado no final com valores atualizados
const response = {
    container: 'mp4',
    ffmpegMode: true,
    infoLog: `Starting plugin ${details().Name} v${details().Version}`,
    processFile: false,
};

// a funcao principal. usando async para esperar os resultados (await) antes de finalizar o plugin
const plugin = async (file, librarySettings, inputs, otherArguments) => {
    const importFresh = require('import-fresh');
    const library = importFresh('../methods/library.js');
    const lib = require('../methods/lib')();
    inputs = lib.loadDefaultValues(inputs, details);

    // preparar a funcao que executa comandos como 'promise'
    const {exec} = require('child_process');
    const {promisify} = require('util');
    const execAsync = promisify(exec);

    // verificar se a gpu e nvidia (windows e ubuntu). debian usa 'nvidia-detect'
    const isNvidiaGpu = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader').then(success => true).catch(error => false);
    console.log('isNvidiaGpu -->', isNvidiaGpu);

    // verificar se o worker e CPU ou GPU
    const isGPUworker = Boolean(otherArguments.workerType.includes('gpu'));
    console.log('isGPUworker -->', isGPUworker);

    // se o worker for de GPU, testar os encoders suportados
    const foundEncoders = [];
    if (isGPUworker) {
        // criar uma lista com todos os comandos que irao verificar os encoders instalados
        const allEncoders = ['hevc_amf', 'hevc_nvenc', 'hevc_qsv', 'hevc_vaapi', 'hevc_videotoolbox'];
        const commands = [];
        allEncoders.forEach(encoder => {
            const command = `${otherArguments.ffmpegPath} -f lavfi -i color=c=black:s=256x256:d=1:r=30 -vcodec ${encoder} -f null /dev/null`;
            commands.push(command);
        });
        console.log('commands -->', commands);

        // verificar o retorno das promises dos comandos de teste
        // a verificacao e feita criando um video 'null' com cada encoder
        // quem nao der erro tem suporte na maquina
        var arrayOfPromises = commands.map(command => execAsync(command));
        await Promise.allSettled(arrayOfPromises)
            .then(results => {
                results.forEach(({status, value, reason}, index) => {
                    if (status === 'fulfilled') {
                        console.log('Promise resolved:', index, allEncoders[index], commands[index]);
                        foundEncoders.push(allEncoders[index]);
                    }
                    else {
                        console.error('Promise rejected:', index, allEncoders[index], reason.cmd);
                    }
                });
            });
        console.log('foundEncoders -->', foundEncoders);
    }

    // escolher um encoder aleatorio da lista de suportados
    // se a lista estiver vazia, usar o encoder padrao 'hevc' (usa cpu em vez de gpu)
    const [chosenEncoder] = foundEncoders.length ? foundEncoders.sort(() => Math.random() - 0.5) : ['hevc'];
    console.log('chosenEncoder -->', chosenEncoder);

    // verificar se e um arquivo de video
    const isVideoFile = file.fileMedium == 'video' ? true : false;
    console.log('isVideoFile -->', isVideoFile);

    // verificar a resolucao atual do video (numero de pixels de altura)
    const videoResolution = file.ffProbeData.streams[0].height;
    const isNotSameResolution = (videoResolution !== inputs.min_resolution && videoResolution !== inputs.max_resolution);
    console.log(`isNotSameResolution --> ${isNotSameResolution} [current: ${videoResolution} | min: ${inputs.min_resolution} | max: ${inputs.max_resolution}]`);

    // verificar o container do arquivo
    const isDifferentContainer = (file.container !== response.container);
    console.log('isDifferentContainer -->', isDifferentContainer, file.container, response.container);

    // verificar se o video ja esta com o codec certo ou se deve ser processado
    const isDifferentCodec = (file.ffProbeData.streams[0].codec_name !== 'hevc');
    console.log('isDifferentCodec -->', isDifferentCodec);

    // verificar se o codec esta na lista de exclusoes
    const {outcome: isAllowedCodec, note} = library.filters.filterByCodec(file, 'exclude', inputs.exclude_codecs);
    console.log('isAllowedCodec -->', isAllowedCodec, inputs.exclude_codecs, note.trim());

    // analisar todas as validacoes acima para decidir se o arquivo sera processado
    // por enquanto nao estou verificando: isNvidiaGpu
    const isAnyFalse = Boolean(isDifferentContainer || isDifferentCodec);
    const isAllTrue = Boolean(isVideoFile && isAllowedCodec && isNotSameResolution);
    const shouldProcess = (isAnyFalse || isAllTrue);
    console.log('shouldProcess -->', shouldProcess, `(${isAnyFalse} || ${isAllTrue})`);

    // definir argumentos do processamento
    if (shouldProcess || file.forceProcessing) {
        response.preset = ` -hwaccel auto <io> -vf "scale=-2:'min(max(ih,${inputs.min_resolution}),${inputs.max_resolution})'" -vcodec ${chosenEncoder} -crf ${inputs.crf} -acodec ${inputs.acodec} `;
        response.processFile = true;
    }

    // retornar os parametros finais atualizados
    return response;
};

module.exports.dependencies = dependencies;
module.exports.details = details;
module.exports.plugin = plugin;

// ---
// nota importante sobre o filtro scale: perdi tantas horas ate encontrar isso que resolvi deixar registrado aqui
// para alterar a altura ou largura mantendo a proporcao eh usado o parametro '-1' em um dos lados do filtro
// porem este calculo automatico pode retornar um numero impar, que nao eh aceito pelo x264 nem pelo hevc
// para o scale arredondar e sempre retornar um numero par, deve-se usar '-2'
// ---
