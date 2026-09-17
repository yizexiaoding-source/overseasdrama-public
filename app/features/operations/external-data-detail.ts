export type DramaDetailTab = "materials" | "playback";

export type RankingDrama = {
  ranking: number;
  playletId: number;
  playletName: string;
  coverOss: string;
  materialCnt: number;
  playletTags: string[];
};

export type DramaDetailFilters = {
  country?: string;
  startDate?: string;
  endDate?: string;
};

export type DramaDetailState = {
  drama: RankingDrama;
  activeTab: DramaDetailTab;
  materialPage: number;
};

export function createDramaDetailState(drama: RankingDrama): DramaDetailState {
  return { drama, activeTab: "materials", materialPage: 1 };
}

export function detailCacheKey({ drama, tab, page, filters }: {
  drama: RankingDrama;
  tab: DramaDetailTab;
  page: number;
  filters: DramaDetailFilters;
}) {
  return [drama.playletId, tab, page, filters.country ?? "", filters.startDate ?? "", filters.endDate ?? ""].join(":");
}

export function createDramaDetailRequest({ drama, tab, page, filters }: {
  drama: RankingDrama;
  tab: DramaDetailTab;
  page: number;
  filters: DramaDetailFilters;
}): { url: string; init: RequestInit } {
  if (tab === "playback") {
    return {
      url: `/api/external-data/playback?name=${encodeURIComponent(drama.playletName)}`,
      init: { cache: "no-store" },
    };
  }

  return {
    url: "/api/external-data/materials",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drama_name: drama.playletName,
        ...(filters.country ? { country_id: Number(filters.country) } : {}),
        ...(filters.startDate ? { start_date: filters.startDate } : {}),
        ...(filters.endDate ? { end_date: filters.endDate } : {}),
        page,
        page_size: 40,
      }),
    },
  };
}
