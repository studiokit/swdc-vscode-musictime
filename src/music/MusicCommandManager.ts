import { window, StatusBarAlignment, StatusBarItem } from "vscode";
import { getSongDisplayName, isMac, getItem, setItem } from "../Util";
import { TrackStatus, Track } from "cody-music";
import {
    requiresSpotifyAccess,
    getDeviceId,
    requiresSpotifyReAuthentication,
} from "./MusicUtil";
import { MusicDataManager } from "./MusicDataManager";
import { MusicManager } from "./MusicManager";

export interface Button {
    /**
     * Id of button
     */
    id: string;
    tooltip: string;
    /**
     * Generator of text for button(Octicons)
     */
    dynamicText?: (cond: boolean) => string;
    /**
     * Generator of color for button
     */
    dynamicColor?: (cond: boolean) => string;
    /**
     * vscode status bar item
     */
    statusBarItem: StatusBarItem;
}

// const songNameDisplayTimeoutMillis: number = 12000;

export class MusicCommandManager {
    private static _buttons: Button[] = [];
    private static _hideSongTimeout = null;
    private static _isLoading: boolean = false;
    private static _songButton: Button = null;
    private static _displaySongButton: Button = null;
    private static _hideCurrentSongTimeout: any = null;

    private constructor() {
        // private to prevent non-singleton usage
    }

    public static isLoading(): boolean {
        return this._isLoading;
    }

    /**
     * Initialize the music command manager.
     * Create the list of status bar buttons that will be displayed.
     */
    public static async initialize() {
        const musictimeMenuTooltip = this.getMusicMenuTooltip();

        let requiresReAuth = requiresSpotifyReAuthentication();
        const requiresAccessToken = requiresSpotifyAccess();

        if (!requiresAccessToken && requiresReAuth) {
            setItem("requiresSpotifyReAuth", false);
            requiresReAuth = false;
        }

        const action = requiresReAuth ? "Reconnect" : "Connect";

        // start with 100 0and go down in sequence
        this.createButton(
            "🎧",
            musictimeMenuTooltip,
            "musictime.revealTree",
            1000
        );
        this.createButton(
            `${action} Spotify`,
            `${action} Spotify to add your top productivity tracks.`,
            "musictime.connectSpotify",
            999
        );
        // play previous or unicode ⏪
        this.createButton(
            "$(chevron-left)",
            "Previous",
            "musictime.previous",
            999
        );
        // 998 buttons (play, pause)
        this.createButton("$(play)", "Play", "musictime.play", 998);
        // pause unicode ⏸
        this.createButton(
            "$(primitive-square)",
            "Stop",
            "musictime.pause",
            998
        );
        // play next ⏩
        this.createButton("$(chevron-right)", "Next", "musictime.next", 997);
        // 996 buttons (unlike, like)
        this.createButton("♡", "Like", "musictime.like", 996);
        this.createButton("♥", "Unlike", "musictime.unlike", 996);
        this.createButton("$(pulse)", "Display song info", "musictime.songTitleRefresh", 995);
        // button area for the current song name
        this.createButton(
            "",
            "Click to view track",
            "musictime.currentSong",
            994
        );
        this.syncControls(null);
    }

    public static initiateProgress(progressLabel: string) {
        this.showProgress(progressLabel);
    }

    public static async syncControls(
        track: Track,
        showLoading: boolean = false,
        statusOverride: TrackStatus = null
    ) {
        if (this._hideSongTimeout) {
            clearTimeout(this._hideSongTimeout);
        }

        const trackStatus: TrackStatus = track
            ? track.state
            : TrackStatus.NotAssigned;

        let pauseIt = trackStatus === TrackStatus.Playing;
        let playIt = trackStatus === TrackStatus.Paused;

        if (statusOverride) {
            if (statusOverride === TrackStatus.Playing) {
                playIt = false;
                pauseIt = true;
            } else {
                playIt = true;
                pauseIt = false;
            }
        }

        this._isLoading = showLoading;
        const foundDevice = getDeviceId() ? true : false;

        const requiresAccessToken = requiresSpotifyAccess();
        let requiresReAuth = requiresSpotifyReAuthentication();

        if (!requiresAccessToken && requiresReAuth) {
            setItem("requiresSpotifyReAuth", false);
            requiresReAuth = false;
        }

        const isPremiumUser = MusicManager.getInstance().isSpotifyPremium();

        const isNonPremiumNonMacUser =
            !isMac() && !isPremiumUser ? true : false;
        const requiresAuth =
            requiresAccessToken || requiresReAuth ? true : false;
        const hasDeviceOrSong = pauseIt || playIt || foundDevice ? true : false;

        if (requiresAuth) {
            this.showLaunchPlayerControls();
        } else {
            if (pauseIt) {
                this.showPauseControls(track);
            } else {
                this.showPlayControls(track);
            }
        }
    }

    /**
     * Create a status bar button
     * @param text
     * @param tooltip
     * @param command
     * @param priority
     */
    private static createButton(
        text: string,
        tooltip: string,
        command: string,
        priority: number
    ) {
        let statusBarItem = window.createStatusBarItem(
            StatusBarAlignment.Left,
            priority
        );
        statusBarItem.text = text;
        statusBarItem.command = command;
        statusBarItem.tooltip = tooltip;

        let button: Button = {
            id: command,
            statusBarItem,
            tooltip: tooltip,
        };

        this._buttons.push(button);
    }

    /**
     * Show launch is when the user needs to connect to spotify
     */
    private static async showLaunchPlayerControls() {
        if (!this._buttons || this._buttons.length === 0) {
            return;
        }

        const requiresAccessToken = requiresSpotifyAccess();
        let requiresReAuth = requiresSpotifyReAuthentication();

        if (!requiresAccessToken && requiresReAuth) {
            setItem("requiresSpotifyReAuth", false);
            requiresReAuth = false;
        }

        const action = requiresReAuth ? "Reconnect" : "Connect";

        // hide all except for the launch player button and possibly connect spotify button
        this._buttons = this._buttons.map((button) => {
            const btnCmd = button.statusBarItem.command;

            const isMusicTimeMenuButton = btnCmd === "musictime.revealTree";
            const isConnectButton = btnCmd === "musictime.connectSpotify";

            if (isMusicTimeMenuButton) {
                button.tooltip = this.getMusicMenuTooltip();
                // always show the headphones button for the launch controls function
                button.statusBarItem.show();
            } else if (
                isConnectButton &&
                (requiresAccessToken || requiresReAuth)
            ) {
                // show the connect button
                button.statusBarItem.show();
                button.statusBarItem.text = `${action} Spotify`;
            } else {
                // hide the rest
                button.statusBarItem.hide();
            }
            return button;
        });
    }

    /**
     * Show the buttons to play a track
     * @param trackInfo
     */
    private static async showPlayControls(trackInfo: Track) {
        if (!trackInfo && !getDeviceId()) {
            this.showLaunchPlayerControls();
        } else if (!trackInfo) {
            trackInfo = new Track();
        }

        if (!this._buttons || this._buttons.length === 0) {
            return;
        }

        const trackName = trackInfo ? trackInfo.name : "";
        const songInfo = trackInfo
            ? `${trackInfo.name} (${trackInfo.artist})`
            : "";

        const isLiked =
            trackInfo && trackInfo.id
                ? MusicDataManager.getInstance().isLikedTrack(trackInfo.id)
                : false;

        this._buttons.map((button) => {
            const btnCmd = button.statusBarItem.command;
            const isMusicTimeMenuButton = btnCmd === "musictime.revealTree";
            const isPlayButton = btnCmd === "musictime.play";
            const isLikedButton = btnCmd === "musictime.like";
            const isUnLikedButton = btnCmd === "musictime.unlike";
            const refreshSongStatusButton = btnCmd === "musictime.songTitleRefresh";
            const currentSongButton = btnCmd === "musictime.currentSong";
            const isPrevButton = btnCmd === "musictime.previous";
            const isNextButton = btnCmd === "musictime.next";

            if (isMusicTimeMenuButton || isPrevButton || isNextButton) {
                if (isMusicTimeMenuButton) {
                    button.tooltip = this.getMusicMenuTooltip();
                }
                // always show the headphones menu icon
                button.statusBarItem.show();
            } else if (isLikedButton && trackName) {
                if (isLiked) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else if (isUnLikedButton && trackName) {
                if (isLiked) {
                    button.statusBarItem.show();
                } else {
                    button.statusBarItem.hide();
                }
            } else if (currentSongButton) {
                button.statusBarItem.tooltip = `(${songInfo})`;
                button.statusBarItem.text = getSongDisplayName(trackName);
                button.statusBarItem.show();
                this._songButton = button;
            } else if (isPlayButton) {
                if (songInfo) {
                    // show the song info over the play button
                    button.statusBarItem.tooltip = `${button.tooltip} - ${songInfo}`;
                }
                button.statusBarItem.show();
            } else if (refreshSongStatusButton) {
                this._displaySongButton = button;
                if (trackName) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else {
                button.statusBarItem.hide();
            }
        });

        this.hideCurrentSong();
    }

    /**
     * Show the buttons to pause a track
     * @param trackInfo
     */
    private static async showPauseControls(trackInfo: Track) {
        if (!trackInfo && !getDeviceId()) {
            this.showLaunchPlayerControls();
        } else if (!trackInfo) {
            trackInfo = new Track();
        }

        if (!this._buttons || this._buttons.length === 0) {
            return;
        }

        const trackName = trackInfo ? trackInfo.name : "";
        const songInfo = trackInfo
            ? `${trackInfo.name} (${trackInfo.artist})`
            : "";

        const isLiked =
            trackInfo && trackInfo.id
                ? MusicDataManager.getInstance().isLikedTrack(trackInfo.id)
                : false;

        this._buttons.map((button) => {
            const btnCmd = button.statusBarItem.command;
            const isMusicTimeMenuButton = btnCmd === "musictime.revealTree";
            const isPauseButton = btnCmd === "musictime.pause";
            const isLikedButton = btnCmd === "musictime.like";
            const isUnLikedButton = btnCmd === "musictime.unlike";
            const refreshSongStatusButton = btnCmd === "musictime.songTitleRefresh";
            const currentSongButton = btnCmd === "musictime.currentSong";
            const isPrevButton = btnCmd === "musictime.previous";
            const isNextButton = btnCmd === "musictime.next";

            if (isMusicTimeMenuButton || isPrevButton || isNextButton) {
                if (isMusicTimeMenuButton) {
                    button.tooltip = this.getMusicMenuTooltip();
                }
                // always show the headphones menu icon
                button.statusBarItem.show();
            } else if (isLikedButton && trackName) {
                if (isLiked) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else if (isUnLikedButton && trackName) {
                if (isLiked) {
                    button.statusBarItem.show();
                } else {
                    button.statusBarItem.hide();
                }
            } else if (currentSongButton) {
                button.statusBarItem.tooltip = `(${songInfo})`;
                button.statusBarItem.text = getSongDisplayName(trackName);
                button.statusBarItem.show();
                this._songButton = button;
            } else if (isPauseButton) {
                if (songInfo) {
                    button.statusBarItem.tooltip = `${button.tooltip} - ${songInfo}`;
                }
                button.statusBarItem.show();
            } else if (refreshSongStatusButton) {
                this._displaySongButton = button;
                if (trackName) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else {
                button.statusBarItem.hide();
            }
        });

        this.hideCurrentSong();
    }

    private static showProgress(progressLabel: string) {
        this._buttons.map((button) => {
            const btnCmd = button.statusBarItem.command;
            const isMusicTimeMenuButton = btnCmd === "musictime.revealTree";
            const isMusicTimeProgress = btnCmd === "musictime.progress";

            if (isMusicTimeMenuButton || isMusicTimeProgress) {
                if (isMusicTimeMenuButton) {
                    button.tooltip = this.getMusicMenuTooltip();
                }
                // show progress and headphones menu buttons
                button.statusBarItem.show();
            } else {
                // hide the rest
                button.statusBarItem.hide();
            }
        });
    }

    private static getMusicMenuTooltip() {
        const name = getItem("name");

        const requiresAccessToken = requiresSpotifyAccess();
        let requiresReAuth = requiresSpotifyReAuthentication();

        if (!requiresAccessToken && requiresReAuth) {
            setItem("requiresSpotifyReAuth", false);
            requiresReAuth = false;
        }

        if (requiresAccessToken || requiresReAuth) {
            const action = requiresReAuth ? "Reconnect" : "Connect";
            return `${action} Spotify`;
        }

        let musicTimeTooltip = "Click to see more from Music Time";
        if (name) {
            musicTimeTooltip = `${musicTimeTooltip} (${name})`;
        }
        return musicTimeTooltip;
    }

    private static hideCurrentSong() {
        if (this._hideCurrentSongTimeout) {
            // cancel the current timeout
            clearTimeout(this._hideCurrentSongTimeout);
            this._hideCurrentSongTimeout = null;
        }

        this._hideCurrentSongTimeout = setTimeout(() => {
            if (this._displaySongButton) {
                this._displaySongButton.statusBarItem.show();
            }
            if (this._songButton) {
                this._songButton.statusBarItem.hide();
            }
        }, 5000);
    }
}
