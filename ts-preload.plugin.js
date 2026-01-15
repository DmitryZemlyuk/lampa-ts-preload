(function () {
    'use strict';

    if (!window.Lampa) return;

    const PLUGIN_ID = 'ts_preload';
    let originalPlay = null;
    let modal = null;
    let network = null;

    /* =========================
       LANG
    ========================= */

    Lampa.Lang.add({
        ts_preload_title: { ru: 'Предзагрузка', en: 'Preload' },
        ts_preload_preload: { ru: 'Загружено', en: 'Preloaded' },
        ts_preload_speed: { ru: 'Скорость', en: 'Speed' },
        ts_preload_peers: { ru: 'Подключения', en: 'Peers' }
    });

    /* =========================
       SETTINGS
    ========================= */

    Lampa.SettingsApi.addParam({
        component: 'checkbox',
        param: {
            name: 'ts_preload_enabled',
            default: true
        },
        field: {
            name: 'Предзагрузка TorrServer',
            description: 'Показывать окно предзагрузки перед стартом видео'
        },
        onChange: () => {}
    });

    /* =========================
       UTILS
    ========================= */

    function tsIP() {
        return Lampa.Torserver?.ip
            ? Lampa.Torserver.ip()
            : Lampa.Storage.get(
                  Lampa.Storage.field('torrserver_use_link') === 'two'
                      ? 'torrserver_url_two'
                      : 'torrserver_url'
              );
    }

    function parseUrl(url) {
        const m = url.match(/^(https?:\/\/.+?)(\/stream\/[^?]+)\?(.+)$/i);
        if (!m) return null;

        const args = {};
        m[3].split('&').forEach(v => {
            const p = v.split('=');
            args[p[0]] = p[1] || null;
        });

        delete args.play;
        delete args.preload;
        delete args.stat;

        const qs = Object.keys(args)
            .map(k => k + (args[k] ? '=' + args[k] : ''))
            .join('&');

        return {
            base: m[1],
            stream: m[2],
            args,
            clean: m[1] + m[2] + '?' + qs
        };
    }

    /* =========================
       MODAL (NEW API)
    ========================= */

    function openModal() {
        const html = $(`
            <div class="broadcast__text">
                <div class="js-peer"></div>
                <div class="js-buff"></div>
                <div class="js-speed"></div>
            </div>
        `);

        modal = new Lampa.Modal({
            title: Lampa.Lang.translate('ts_preload_title'),
            content: html,
            size: 'medium',
            buttons: [
                {
                    name: Lampa.Lang.translate('cancel'),
                    onSelect: cancel
                },
                {
                    name: Lampa.Lang.translate('player_lauch'),
                    onSelect: play
                }
            ]
        });

        modal.show();

        return html;
    }

    function closeModal() {
        if (modal) {
            modal.destroy();
            modal = null;
        }
    }

    /* =========================
       PRELOAD LOGIC
    ========================= */

    let playData = null;

    function startPreload(data) {
        const u = parseUrl(data.url);
        if (!u || !u.args.link) return originalPlay(data);

        playData = data;
        network = new Lampa.Reguest();

        const html = openModal();

        network.timeout(1800 * 1000);
        network.silent(u.clean + '&preload', play, play);

        network.timeout(2000);

        const stat = function (res) {
            if (!res?.Torrent) return;

            const t = res.Torrent;
            const percent = Math.floor(
                (t.preloaded_bytes || 0) * 100 / (t.preload_size || 1)
            );

            html.find('.js-peer').text(
                `${Lampa.Lang.translate('ts_preload_peers')}: ${t.active_peers || 0}`
            );
            html.find('.js-buff').text(
                `${Lampa.Lang.translate('ts_preload_preload')}: ${percent}%`
            );
            html.find('.js-speed').text(
                `${Lampa.Lang.translate('ts_preload_speed')}: ${
                    Lampa.Utils.bytesToSize((t.download_speed || 0) * 8, true)
                }`
            );
        };

        network.silent(
            u.base + '/cache',
            stat,
            stat,
            JSON.stringify({ action: 'get', hash: u.args.link })
        );
    }

    function cancel() {
        network?.clear();
        closeModal();
        playData = null;
    }

    function play() {
        network?.clear();
        closeModal();
        originalPlay(playData);
        playData = null;
    }

    /* =========================
       PLUGIN
    ========================= */

    Lampa.Plugin.create({
        id: PLUGIN_ID,
        version: '1.0.0',
        name: 'TorrServer Preload',

        init: function () {
            originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (data) {
                if (
                    Lampa.Storage.field('ts_preload_enabled') &&
                    data?.url &&
                    tsIP() &&
                    data.url.includes(tsIP())
                ) {
                    startPreload(data);
                } else {
                    originalPlay(data);
                }
            };
        },

        destroy: function () {
            if (originalPlay) {
                Lampa.Player.play = originalPlay;
            }
            network?.clear();
            closeModal();
        }
    });
})();
