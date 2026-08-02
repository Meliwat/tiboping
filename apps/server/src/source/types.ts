export type XUser = {
  id: string;
  name: string;
  username: string;
  protected: boolean;
};

export type XReferencedPost = {
  type: 'replied_to' | 'quoted' | 'retweeted';
  id: string;
};

export type XPost = {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  referenced_tweets?: XReferencedPost[] | undefined;
  note_tweet?: { text: string } | undefined;
};

export type XStreamRule = {
  id: string;
  value: string;
  tag?: string | undefined;
};

export type XPostPage = {
  posts: XPost[];
  nextToken?: string;
};

export type XApi = {
  resolveUser: (username: string) => Promise<XUser>;
  listStreamRules: () => Promise<XStreamRule[]>;
  addStreamRule: (rule: { value: string; tag: string }) => Promise<XStreamRule>;
  deleteStreamRules: (ids: string[]) => Promise<void>;
  fetchUserPosts: (
    userId: string,
    options: { sinceId?: string; paginationToken?: string; maxResults: number },
  ) => Promise<XPostPage>;
  openFilteredStream: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
};

export type TiboPostSource = {
  prepare: () => Promise<XUser>;
  fetchLatest: (userId: string) => Promise<XPost[]>;
  fetchAfter: (userId: string, sinceId: string) => Promise<XPost[]>;
  consumeStream: (
    signal: AbortSignal,
    onPost: (post: XPost) => Promise<void>,
  ) => Promise<void>;
};
