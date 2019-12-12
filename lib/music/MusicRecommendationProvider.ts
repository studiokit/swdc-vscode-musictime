import {
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    EventEmitter,
    Event,
    Disposable,
    TreeView,
    commands
} from "vscode";
import * as path from "path";
import {
    PlaylistItem,
    TrackStatus,
    getRecommendationsForTracks,
    Track,
    playSpotifyMacDesktopTrack
} from "cody-music";
import { RecommendationManager } from "./RecommendationManager";
import { logIt, getPlaylistIcon } from "../Util";
import { MusicManager } from "./MusicManager";

/**
 * Create the playlist tree item (root or leaf)
 * @param p
 * @param cstate
 */
const createPlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new PlaylistTreeItem(p, cstate);
};

export const getRecommendedTracks = async (trackIds, limit = 10) => {
    let items: PlaylistItem[] = [];
    // only takes Up to 5
    trackIds = trackIds.splice(0, 5);
    try {
        const tracks: Track[] = await getRecommendationsForTracks(
            trackIds,
            limit,
            "" /*market*/,
            10 /*min_popularity*/
        );
        // turn the tracks into playlist item
        if (tracks && tracks.length > 0) {
            for (let i = 0; i < tracks.length; i++) {
                const track: Track = tracks[i];
                const item: PlaylistItem = MusicManager.getInstance().createPlaylistItemFromTrack(
                    track,
                    0
                );
                item.tag = "spotify";
                items.push(item);
            }
        }
    } catch (e) {
        //
    }
    return items;
};

/**
 * Handles the playlist onDidChangeSelection event
 */
export const connectRecommendationPlaylistTreeView = (
    view: TreeView<PlaylistItem>
) => {
    // view is {selection: Array[n], visible, message}
    return Disposable.from(
        // e is {selection: Array[n]}
        view.onDidChangeSelection(async e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }
            let playlistItem: PlaylistItem = e.selection[0];

            if (playlistItem.command) {
                // run the command
                commands.executeCommand(playlistItem.command);
                return;
            } else if (playlistItem["cb"]) {
                const cbFunc = playlistItem["cb"];
                cbFunc();
                return;
            }

            // const isExpand = playlistItem.type === "playlist" ? true : false;

            // play it
            // playSelectedItem(playlistItem, isExpand);
            playSpotifyMacDesktopTrack(playlistItem.id);
        }),
        view.onDidChangeVisibility(e => {
            if (e.visible) {
                //
            }
        })
    );
};
export class MusicRecommendationProvider
    implements TreeDataProvider<PlaylistItem> {
    private _onDidChangeTreeData: EventEmitter<
        PlaylistItem | undefined
    > = new EventEmitter<PlaylistItem | undefined>();

    readonly onDidChangeTreeData: Event<PlaylistItem | undefined> = this
        ._onDidChangeTreeData.event;

    private view: TreeView<PlaylistItem>;

    constructor() {
        //
    }

    bindView(view: TreeView<PlaylistItem>): void {
        this.view = view;
    }

    getParent(_p: PlaylistItem) {
        return void 0; // all playlists are in root
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshParent(parent: PlaylistItem) {
        this._onDidChangeTreeData.fire(parent);
    }

    isTrackInPlaylistRunning(p: PlaylistItem) {
        // const selectedTrack: PlaylistItem = RecommendationManager.getInstance()
        //     .selectedTrackItem;
        // if (selectedTrack && selectedTrack["playlist_id"] === p.id) {
        //     this.selectTrack(selectedTrack, false /* select */);
        //     return true;
        // }
        // return false;
        return false;
    }

    selectTrack(p: PlaylistItem, select: boolean = true) {
        // reveal the track state if it's playing or paused
        try {
            // don't "select" it though. that will invoke the pause/play action
            this.view.reveal(p, {
                focus: true,
                select
            });
        } catch (err) {
            logIt(`Unable to select track: ${err.message}`);
        }
    }

    async selectPlaylist(p: PlaylistItem) {
        try {
            // don't "select" it though. that will invoke the pause/play action
            await this.view.reveal(p, {
                focus: true,
                select: false,
                expand: true
            });
            // playSelectedItem(p, false);
        } catch (err) {
            logIt(`Unable to select playlist: ${err.message}`);
        }
    }

    getTreeItem(p: PlaylistItem): PlaylistTreeItem {
        const treeItem: PlaylistTreeItem = createPlaylistTreeItem(
            p,
            TreeItemCollapsibleState.None
        );
        return treeItem;
    }

    async getChildren(element?: PlaylistItem): Promise<PlaylistItem[]> {
        // get the 1st 6 tracks from the liked songs
        const likedSongs: Track[] = MusicManager.getInstance()
            .spotifyLikedSongs;
        const trackIds = likedSongs.map((track: Track) => {
            return track.id;
        });
        return getRecommendedTracks(trackIds, 10);
    }
}

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
export class PlaylistTreeItem extends TreeItem {
    constructor(
        private readonly treeItem: PlaylistItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(treeItem.name, collapsibleState);

        const { lightPath, darkPath, contextValue } = getPlaylistIcon(treeItem);
        if (lightPath && darkPath) {
            this.iconPath.light = lightPath;
            this.iconPath.dark = darkPath;
        } else {
            // no matching tag, remove the tree item icon path
            delete this.iconPath;
        }
        this.contextValue = contextValue;
    }

    get tooltip(): string {
        if (!this.treeItem) {
            return "";
        }
        if (this.treeItem.tooltip) {
            return `${this.treeItem.tooltip}`;
        } else {
            return `${this.treeItem.name}`;
        }
    }

    iconPath = {
        light: "",
        dark: ""
    };

    contextValue = "playlistItem";
}