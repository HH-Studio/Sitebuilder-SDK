// The one path the overlay posts to and the handler answers on. Its own module
// so the BROWSER half can import it without dragging in the node half: the
// handler imports `node:fs/promises`, and a constant shared through that file
// would put the filesystem in every agency's client bundle.
export const LOCAL_CONTENT_PATH = "/__snabbsite/content";
