// GRID API Types for Team Compositions

export interface League {
  id: string;
  name: string;
  teams: Team[];
}

export interface Team {
  id: string;
  name: string;
  nameShortened: string;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  players: Player[];
}

export interface Player {
  id: string;
  nickname: string;
  roles: string[];
  teamId: string | null;
}

export interface CompositionsData {
  leagues: League[];
  lastUpdated: string;
}

// GRID API Response Types
export interface GRIDSeriesNode {
  id: string;
  tournament: {
    id: string;
    name: string;
    nameShortened?: string;
    parent?: {
      id: string;
      name: string;
      parent?: {
        id: string;
        name: string;
        parent?: {
          id: string;
          name: string;
        } | null;
      } | null;
    } | null;
  } | null;
  teams: {
    baseInfo: {
      id: string;
      name: string;
      nameShortened?: string;
      logoUrl?: string;
      colorPrimary?: string;
      colorSecondary?: string;
    };
  }[];
}

export interface GRIDSeriesEdge {
  node: GRIDSeriesNode;
}

export interface GRIDSeriesResponse {
  data: {
    allSeries: {
      edges: GRIDSeriesEdge[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

export interface GRIDPlayerNode {
  id: string;
  nickname: string;
  team?: {
    id: string;
    name: string;
  } | null;
  roles?: {
    id: string;
    name: string;
  }[];
}

export interface GRIDPlayerEdge {
  node: GRIDPlayerNode;
}

export interface GRIDPlayersResponse {
  data: {
    players: {
      edges: GRIDPlayerEdge[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}
