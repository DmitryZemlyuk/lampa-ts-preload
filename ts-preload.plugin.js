(function () {
    'use strict';

    if (!window.Lampa) return;

    const PLUGIN_ID = 'ts_preload';
    let originalPlay = null;
    let modal = null;
    let network = null;
    let playData = null;

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
        }
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
            args,
            clean: m[1] + m[2] + '?' + qs
        };
    }

    /* =========================
       MODAL (STABLE)
    ========================= */

    function openModal(content, onBack) {
        const html = Lampa.Template.get('modal', {
            title: Lampa.Lang.translate('ts_preload_title')
        });

        const scroll = new Lampa.Scroll({ over: true });
        html.find('.modal__body').append(scroll.render());
        scroll.append(content);

        const footer = $('<div class="modal__footer"></div>');

        [
            {
                name: Lampa.Lang.translate('cancel'),
                action: cancel
            },
            {
                name: Lampa.Lang.translate('player_lauch'),
                action: play
            }
        ].forEach(btn => {
            const el = $('<div class="modal__button selector"></div>');
            el.text(btn.name);
            el.on('click hover:enter', btn.action);
            footer.append(el);
        });

        scroll.append(footer);
        $('body').append(html);

        Lampa.Controller.add('ts-preload-modal', {
            invisible: true,
            toggle() {
                Lampa.Controller.collectionSet(scroll.render());
                Lampa.Controller.collectionFocus(
                    scroll.render().find('.selector').eq(0)
                );
                Lampa.Layer.visible(scroll.render(true));
            },
            back() {
                onBack && onBack();
            }
        });

        Lampa.Controller.toggle('ts-preload-modal');

        return {
            destroy() {
                scroll.destroy();
                html.remove();
                Lampa.Controller.remove('ts-preload-modal');
            }
        };
    }

    function closeModal() {
        modal?.destroy();
        modal = null;
    }

    /* =========================
       PRELOAD LOGIC
    ========================= */

    function startPreload(data) {
        const u = parseUrl(data.url);
        if (!u || !u.args.link) return originalPlay(data);

        playData = data;
        network = new Lampa.Reguest();

        const html = $(`
            <div class="broadcast__text">
                <div class="js-peer"></div>
                <div class="js-buff"></div>
                <div class="js-speed"></div>
            </div>
        `);

        modal = openModal(html, cancel);

        network.timeout(1800 * 1000);
        network.silent(u.clean + '&preload', play, play);

        network.timeout(2000);
        network.silent(
            u.base + '/cache',
            stat,
            stat,
            JSON.stringify({ action: 'get', hash: u.args.link })
        );

        function stat(res) {
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
        }
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
        name: 'TorrServer Preload',
        version: '1.0.0',

        init() {
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

        destroy() {
            if (originalPlay) {
                Lampa.Player.play = originalPlay;
            }
            network?.clear();
            closeModal();
        }
    });
})();
