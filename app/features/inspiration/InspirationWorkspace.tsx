"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createInspirationMaterialVideoUrl,
  findInspirationMaterialByHash,
  getInspirationMaterial,
  hashInspirationVideo,
  listInspirationMaterialsPage,
  readVideoDuration,
  removeInspirationMaterial,
  retryInspirationMaterialAnalysis,
  saveExternalInspirationReference,
  saveInspirationMaterial,
  submitInspirationReview,
  submitInspirationTypeReview,
  type InspirationMaterial,
  type InspirationMaterialType,
  type MaterialTypeReviewDecision,
  type MaterialTag,
} from "../../lib/inspiration-material-store";
import {
  listInspirationHookAssets,
  reviewHookBoundary,
  type HookAsset,
} from "../../lib/hook-asset-store";
import {
  createPromptFission,
  listMaterialLibraryAssets,
  removeMaterialLibraryAsset,
  renameMaterialLibraryAsset,
  updateMaterialClassification,
  type MaterialLibraryAsset,
  type PromptFissionPlan,
} from "../../lib/material-library-store";
import { isKnownOntologyTag } from "../../lib/ontology/normalization";
import { formatDurationZh, normalizeDurationCopy } from "../../lib/time-format";
import styles from "./InspirationWorkspace.module.css";
import {
  LibraryAnalysisPage,
  MaterialLibraryPanelV2,
} from "./MaterialLibraryPanelV2";

export type InspirationTab =
  | "feed"
  | "aiPrefaces"
  | "narrations"
  | "prototypes"
  | "analysis"
  | "review"
  | "replicate"
  | "narrationPreview";
export type InspirationWorkspaceProps = {
  initialTab?: InspirationTab;
  onOpenFactory?: (hook: HookAsset) => void;
  onSelectForReplication?: (asset: MaterialLibraryAsset) => void;
  onFavoriteChange?: (material: InspirationMaterial, favorite: boolean) => void;
  onMaterialDeleted?: (materialId: string) => void;
  onAddMonitorSource?: () => void;
};
type Material = InspirationMaterial;

const done = (item: Material) => item.analysisStatus === "succeeded";
const duration = (seconds: number) => formatDurationZh(seconds);
const copy = (value: string) => normalizeDurationCopy(value);
const pct = (value: number) => Math.round(value <= 1 ? value * 100 : value);
const isClassificationReviewField = (value: string) => /(?:material.?type|material.?format|body.?format|classification|素材类型|素材归类|成片形态)/i.test(value);
const materialMatchesInboundRange = (
  item: Material,
  start: string,
  end: string,
) => {
  if (!start && !end) return true;
  if (!item.createdAt) return false;
  const created = new Date(item.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  if (start && created < new Date(`${start}T00:00:00`)) return false;
  if (end && created > new Date(`${end}T23:59:59.999`)) return false;
  return true;
};
const tierLabel = (tier?: MaterialTag) => {
  const hasMetricEvidence = (tier?.evidenceSources ?? []).some((source) =>
    /^(?:adx|performance|metrics|manual_review)$/i.test(source),
  );
  if (tier?.verification !== "verified" || !hasMetricEvidence)
    return "层级待定";
  const code = (tier?.code || tier?.label || "").toUpperCase();
  return (
    (
      {
        T0: "最高级素材",
        T1: "一级素材",
        T2: "二级素材",
        T3: "三级素材",
        TX: "层级待定",
      } as Record<string, string>
    )[code] || "层级待定"
  );
};
const cardConclusion = (item: Material, progress: number) => {
  if (item.analysisStatus === "running")
    return `${item.analysisStage || "正在处理"} · ${progress}%`;
  if (item.analysisStatus === "queued")
    return item.analysisStage || "等待素材 Worker";
  if (item.analysisStatus === "failed")
    return item.analysisError || "分析失败，请重新提交";
  if (item.analysisStatus === "succeeded") {
    const reviewRequired =
      ["needs_review", "待复核", "退回重分析"].includes(item.review) ||
      item.analysisV2?.review.reviewRequired === true;
    if (reviewRequired)
      return item.analysisV2?.content.summary
        ? `结果待复核：${copy(item.analysisV2.content.summary)}`
        : "分析任务已结束，但证据不足，结果待复核";
    return item.analysisV2?.content.summary
      ? copy(item.analysisV2.content.summary)
      : "分析已完成，暂无经验证的内容摘要";
  }
  return "尚未开始分析";
};

export function InspirationWorkspace({
  initialTab = "feed",
  onOpenFactory,
  onSelectForReplication,
  onFavoriteChange,
  onMaterialDeleted,
  onAddMonitorSource,
}: InspirationWorkspaceProps) {
  const deepLinkHandled = useRef(false),
    detailRequests = useRef(new Set<string>()),
    filtersHydrated = useRef(false);
  const [tab, setTab] = useState<InspirationTab>(initialTab),
    [materials, setMaterials] = useState<Material[]>([]),
    [hooks, setHooks] = useState<HookAsset[]>([]),
    [libraryAssets, setLibraryAssets] = useState<MaterialLibraryAsset[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [selectedHookId, setSelectedHookId] = useState(""),
    [reviewScope, setReviewScope] = useState<"types" | "content" | "hooks">("types"),
    [query, setQuery] = useState(""),
    [type, setType] = useState("全部类型"),
    [mediaKind, setMediaKind] = useState("全部媒体"),
    [platform, setPlatform] = useState("全部平台"),
    [language, setLanguage] = useState("全部语种"),
    [audience, setAudience] = useState("全部受众"),
    [genre, setGenre] = useState("全部题材"),
    [analysisFilter, setAnalysisFilter] = useState("全部分析状态"),
    [inboundStart, setInboundStart] = useState(""),
    [inboundEnd, setInboundEnd] = useState(""),
    [spendMin, setSpendMin] = useState(""),
    [spendMax, setSpendMax] = useState(""),
    [exposureMin, setExposureMin] = useState(""),
    [exposureMax, setExposureMax] = useState(""),
    [daysMin, setDaysMin] = useState(""),
    [daysMax, setDaysMax] = useState(""),
    [uploadOpen, setUploadOpen] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [detailError, setDetailError] = useState(""),
    [favorites, setFavorites] = useState<string[]>([]),
    [deletingId, setDeletingId] = useState(""),
    [openingId, setOpeningId] = useState("");
  const [loadedPages, setLoadedPages] = useState(1),
    [totalItems, setTotalItems] = useState(0),
    [totalPages, setTotalPages] = useState(1),
    [loadingMore, setLoadingMore] = useState(false),
    [reanalyzingId, setReanalyzingId] = useState("");
  const refreshBusy = useRef(false);
  const mergeMaterials = (next: Material[], replace = false) =>
    setMaterials((current) => {
      const previous = new Map(current.map((item) => [item.id, item]));
      const merged = next.map((item) => {
        const existing = previous.get(item.id);
        return existing?.analysisV2&&!item.analysisV2
          ? { ...item, analysisV2: existing.analysisV2 }
          : item;
      });
      if (replace) return merged;
      const ids = new Set(merged.map((item) => item.id));
      return [...current.filter((item) => !ids.has(item.id)), ...merged];
    });
  const refresh = async (signal?: AbortSignal, includeHooks = false) => {
    if (refreshBusy.current) return materials;
    refreshBusy.current = true;
    try {
      const [pages, assets] = await Promise.all([
        Promise.all(
          Array.from({ length: loadedPages }, (_, index) =>
            listInspirationMaterialsPage(index + 1, 24, signal),
          ),
        ),
        listMaterialLibraryAssets(undefined, signal).catch(() => []),
      ]);
      const nextMaterials = pages.flatMap((value) => value.items);
      mergeMaterials(nextMaterials, true);
      setLibraryAssets(assets);
      setTotalItems(pages[0]?.totalItems ?? nextMaterials.length);
      setTotalPages(pages[0]?.totalPages ?? 1);
      if (includeHooks)
        setHooks(await listInspirationHookAssets(signal).catch(() => []));
      setError("");
      return nextMaterials;
    } catch (reason) {
      if (!signal?.aborted)
        setError(reason instanceof Error ? reason.message : "素材读取失败");
      return undefined;
    } finally {
      refreshBusy.current = false;
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const tick = async (first = false) => {
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(() => void tick(), 10000);
        return;
      }
      const next = await refresh(controller.signal, first);
      if (controller.signal.aborted) return;
      const active = next?.some(
        (item) =>
          item.analysisStatus === "queued" || item.analysisStatus === "running",
      );
      timer = window.setTimeout(() => void tick(), active ? 5000 : 30000);
    };
    void tick(true);
    const visible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [loadedPages]);
  const loadMore = async () => {
    if (loadingMore || loadedPages >= totalPages) return;
    setLoadingMore(true);
    try {
      const page = await listInspirationMaterialsPage(loadedPages + 1, 24);
      mergeMaterials(page.items);
      setLoadedPages(page.page);
      setTotalItems(page.totalItems);
      setTotalPages(page.totalPages);
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "下一页读取失败");
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    const onScroll = () => {
      if (
        tab === "feed" &&
        !loadingMore &&
        loadedPages < totalPages &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 700
      )
        void loadMore();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tab, loadingMore, loadedPages, totalPages]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab") as InspirationTab | null;
    if (
      requestedTab &&
      [
        "feed",
        "aiPrefaces",
        "narrations",
        "prototypes",
        "review",
        "replicate",
        "narrationPreview",
      ].includes(requestedTab)
    )
      setTab(requestedTab);
    setQuery(params.get("q") || "");
    setMediaKind(params.get("media") || "全部媒体");
    setPlatform(params.get("platform") || "全部平台");
    setLanguage(params.get("language") || "全部语种");
    setType(params.get("type") || "全部类型");
    setAudience(params.get("audience") || "全部受众");
    setGenre(params.get("genre") || "全部题材");
    setAnalysisFilter(params.get("status") || "全部分析状态");
    setInboundStart(params.get("from") || "");
    setInboundEnd(params.get("to") || "");
    setSpendMin(params.get("spendMin") || "");
    setSpendMax(params.get("spendMax") || "");
    setExposureMin(params.get("exposureMin") || "");
    setExposureMax(params.get("exposureMax") || "");
    setDaysMin(params.get("daysMin") || "");
    setDaysMax(params.get("daysMax") || "");
    filtersHydrated.current = true;
    document.title = "灵感大屏 — Lumina";
  }, []);
  useEffect(() => {
    if (!filtersHydrated.current) return;
    const params = new URLSearchParams(window.location.search);
    const values = {
      tab: tab === "feed" ? "" : tab,
      q: query,
      media: mediaKind === "全部媒体" ? "" : mediaKind,
      platform: platform === "全部平台" ? "" : platform,
      language: language === "全部语种" ? "" : language,
      type: type === "全部类型" ? "" : type,
      audience: audience === "全部受众" ? "" : audience,
      genre: genre === "全部题材" ? "" : genre,
      status: analysisFilter === "全部分析状态" ? "" : analysisFilter,
      from: inboundStart,
      to: inboundEnd,
      spendMin,
      spendMax,
      exposureMin,
      exposureMax,
      daysMin,
      daysMax,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }, [
    tab,
    query,
    mediaKind,
    platform,
    language,
    type,
    audience,
    genre,
    analysisFilter,
    inboundStart,
    inboundEnd,
    spendMin,
    spendMax,
    exposureMin,
    exposureMax,
    daysMin,
    daysMax,
  ]);
  const completed = materials.filter(done),
    selected = completed.find((v) => v.id === selectedId) ?? completed[0];
  const typeReviewItems = completed
    .filter((v) => {
      if (v.mediaKind === "图片") return v.type !== "海报图片";
      if (v.classificationSource === "人工" && v.type !== "未判定") return false;
      const creative = v.analysisV2?.creative;
      const assembly = creative?.hookAssemblyType?.label || "";
      const hasPrefaceSignal = ["同剧外搭", "跨剧外搭", "外搭来源待确认"].includes(assembly);
      const hasNarrationSignal = (creative?.narrationSegments || []).some((segment) => segment.verification === "verified");
      const contradictsOriginal = v.type === "原剧拼接" && (hasPrefaceSignal || hasNarrationSignal);
      return v.type === "未判定" ||
        creative?.materialType?.verification === "needs_review" ||
        contradictsOriginal ||
        (v.classificationSource === "AI" && v.classificationConfidence > 0 && v.classificationConfidence < .85);
    })
    .sort((left, right) => {
      const conflictScore = (item: Material) => {
        if (item.type !== "原剧拼接") return 0;
        const creative = item.analysisV2?.creative;
        const assembly = creative?.hookAssemblyType?.label || "";
        const hasPreface = ["同剧外搭", "跨剧外搭", "外搭来源待确认"].includes(assembly);
        const hasNarration = (creative?.narrationSegments || []).some((segment) => segment.verification === "verified");
        return hasPreface || hasNarration ? 1 : 0;
      };
      return conflictScore(right) - conflictScore(left) ||
        (right.adxMetrics.impressions || right.exposure || 0) - (left.adxMetrics.impressions || left.exposure || 0);
    });
  const contentReviewItems = completed.filter((v) => {
    const reviewItems = v.analysisV2?.review.items || [];
    const hasContentReview = reviewItems.some((item) => !isClassificationReviewField(`${item.field} ${item.label}`));
    const hasTagReview = Object.values(v.analysisV2?.content || {}).some((group) =>
      Array.isArray(group) && group.some((tag) => tag && typeof tag === "object" && "verification" in tag && tag.verification === "needs_review"),
    );
    return hasContentReview || hasTagReview;
  });
  const hookReviewItems = hooks.filter(
    (hook) =>
      hook.boundaryStatus !== "verified" || hook.reviewStatus !== "approved",
  );
  const prototypes = useMemo(() => {
    const groups = new Map<string, HookAsset[]>();
    for (const hook of hooks) {
      const key = hook.hookType || "待分类";
      groups.set(key, [...(groups.get(key) ?? []), hook]);
    }
    return [...groups].map(([label, items]) => ({ label, items }));
  }, [hooks]);
  const numericRange = (value: number | undefined, min: string, max: string) =>
    (!min || Number(value ?? 0) >= Number(min)) &&
    (!max || Number(value ?? 0) <= Number(max));
  const filtered = materials.filter(
    (item) =>
      (type === "全部类型" || item.type === type) &&
      (mediaKind === "全部媒体" || item.mediaKind === mediaKind) &&
      (platform === "全部平台" || item.platform === platform) &&
      (language === "全部语种" || item.language === language) &&
      (audience === "全部受众" || item.audienceType === audience) &&
      (genre === "全部题材" || item.genres.includes(genre)) &&
      (analysisFilter==="全部分析状态"||item.analysisStatus==="succeeded") &&
      numericRange(item.adxMetrics.spend, spendMin, spendMax) &&
      numericRange(
        item.adxMetrics.impressions ?? item.exposure,
        exposureMin,
        exposureMax,
      ) &&
      numericRange(item.adxMetrics.days ?? item.days, daysMin, daysMax) &&
      materialMatchesInboundRange(item, inboundStart, inboundEnd) &&
      (!query ||
        `${item.title} ${item.platform} ${item.theme} ${item.genres.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const aiPrefaces = libraryAssets.filter(
      (asset) => asset.kind === "ai_preface",
    ),
    narrations = libraryAssets.filter((asset) => asset.kind === "narration");
  const requestedAssetId =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("asset") || "";
  const requestedLibraryAsset = libraryAssets.find(
    (asset) => asset.id === requestedAssetId,
  );
  const requestedPrefaceAsset =
    requestedLibraryAsset?.kind === "ai_preface" ? requestedLibraryAsset : undefined;
  const requestedNarrationAsset =
    requestedLibraryAsset?.kind === "narration" ? requestedLibraryAsset : undefined;
  const requestedLibraryWorkflow =
    typeof window === "undefined"
      ? "analysis"
      : (() => {
          const workflow = new URLSearchParams(window.location.search).get("workflow");
          return workflow === "script" || workflow === "fission" || workflow === "adapt" ? workflow : "analysis";
        })();
  const counts = {
    feed: materials.length,
    aiPrefaces: aiPrefaces.length,
    narrations: narrations.length,
    prototypes: hooks.length,
    analysis: completed.length,
    review: typeReviewItems.length + contentReviewItems.length + hookReviewItems.length,
  };
  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const exitLibraryAnalysis = (next: InspirationTab) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("asset");
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    setTab(next);
  };
  const selectAnalysis = (id: string) => {
    setSelectedId(id);
    setTab("analysis");
    setDetailError("");
    const existing = materials.find((item) => item.id === id);
    if (existing?.analysisV2) {
      setOpeningId("");
      detailRequests.current.delete(id);
      return;
    }
    if (detailRequests.current.has(id)) return;
    detailRequests.current.add(id);
    setOpeningId(id);
    window.setTimeout(() => {
      void getInspirationMaterial(id)
        .then((detailed) => {
          if (!detailed.analysisV2)
            throw new Error("详情接口未返回 material-v2 结果");
          setMaterials((current) =>
            current.map((item) => (item.id === id ? detailed : item)),
          );
        })
        .catch((reason) => {
          const message =
            reason instanceof Error ? reason.message : "分析结果读取失败";
          setDetailError(message);
          flash(message);
        })
        .finally(() => {
          detailRequests.current.delete(id);
          setOpeningId("");
        });
    }, 100);
  };
  const selectHookReview = (id: string) => {
    setSelectedHookId(id);
    setReviewScope("hooks");
    setTab("review");
    const url = new URL(window.location.href);
    url.searchParams.set("reviewHook", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };
  useEffect(() => {
    if (deepLinkHandled.current || !materials.length) return;
    const id = new URLSearchParams(window.location.search).get("analysis");
    if (!id) return;
    deepLinkHandled.current = true;
    selectAnalysis(id);
  }, [materials.length]);
  useEffect(() => {
    if (
      tab !== "analysis" ||
      !selected ||
      selected.analysisV2 ||
      openingId ||
      detailError ||
      detailRequests.current.has(selected.id)
    )
      return;
    selectAnalysis(selected.id);
  }, [tab, selected?.id, selected?.analysisV2, openingId, detailError]);
  useEffect(() => {
    if (!hooks.length) return;
    const id = new URLSearchParams(window.location.search).get("reviewHook");
    if (id && hooks.some((hook) => hook.id === id)) {
      setSelectedHookId(id);
      setTab("review");
    }
  }, [hooks.length]);
  const open = async (item: Material) => {
    if (item.analysisStatus === "failed") {
      await retryInspirationMaterialAnalysis(item.id);
      flash("已重新加入分析队列");
      void refresh();
      return;
    }
    if (done(item)) {
      await selectAnalysis(item.id);
      return;
    }
    flash(
      item.analysisStatus === "running"
        ? `${item.analysisStage || "正在分析"} · ${Math.round(item.analysisProgress ?? 0)}%`
        : "正在等待分析",
    );
  };
  const reanalyze = async (item: Material) => {
    if (reanalyzingId) return;
    if (!window.confirm(`确定重新分析“${item.title}”吗？`)) return;
    setReanalyzingId(item.id);
    setMaterials((current) =>
      current.map((value) =>
        value.id === item.id
          ? {
              ...value,
              analysisStatus: "queued",
              analysisProgress: 0,
              analysisStage: "等待素材 Worker",
              analysisError: undefined,
            }
          : value,
      ),
    );
    try {
      await retryInspirationMaterialAnalysis(item.id, true);
      flash("已重新加入分析队列");
      void refresh();
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "重新分析提交失败");
    } finally {
      setReanalyzingId("");
    }
  };
  const favorite = (id: string) => {
    const next = !favorites.includes(id);
    setFavorites((old) => (next ? [...old, id] : old.filter((v) => v !== id)));
    const material = materials.find((item) => item.id === id);
    if (material) onFavoriteChange?.(material, next);
  };
  const changeType = async (item: Material, next: string) => {
    try {
      await updateMaterialClassification(item.id, next);
      setMaterials((current) =>
        current.map((value) =>
          value.id === item.id
            ? {
                ...value,
                type: next as InspirationMaterialType,
                classificationSource: "人工",
                libraryBucket:
                  next === "AI前贴"
                    ? "ai_preface"
                    : next === "解说"
                      ? "narration"
                      : "running",
              }
            : value,
        ),
      );
      flash("素材类型已保存");
      void refresh();
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "素材类型保存失败");
    }
  };
  const removeMaterial = async (item: Material) => {
    if (
      !window.confirm(
        `确定永久删除素材“${item.title}”吗？\n\n视频文件、分析结果和关联钩子将一并删除，此操作不可撤销。`,
      )
    )
      return;
    setDeletingId(item.id);
    try {
      await removeInspirationMaterial(item.id);
      setMaterials((current) =>
        current.filter((value) => value.id !== item.id),
      );
      setHooks((current) =>
        current.filter((value) => value.materialId !== item.id),
      );
      setFavorites((current) => current.filter((id) => id !== item.id));
      setSelectedId((current) => (current === item.id ? "" : current));
      onMaterialDeleted?.(item.id);
      flash("素材及关联分析已删除");
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "素材删除失败");
    } finally {
      setDeletingId("");
    }
  };
  return (
    <section className={styles.workspace} aria-label="灵感大屏工作区">
      <div className={styles.workspaceTopbar}>
        <nav className={styles.tabs} role="tablist" aria-label="素材功能库">
          {(
            [
              ["feed", "跑量素材"],
              ["aiPrefaces", "AI 前贴库"],
              ["narrations", "解说库"],
              ["prototypes", "钩子原型"],
              ["review", "人工复核"],
            ] as const
          ).map(([key, label]) => (
            <button
              role="tab"
              aria-selected={tab === key}
              key={key}
              className={tab === key ? styles.activeTab : ""}
              onClick={() => setTab(key)}
            >
              <span>{label}</span>
              <em>{counts[key]}</em>
            </button>
          ))}
        </nav>
        <div className={styles.topbarActions}>
          {onAddMonitorSource && (
            <button className={styles.secondary} onClick={onAddMonitorSource}>
              ＋ 添加监测源
            </button>
          )}
          <button
            className={styles.primary}
            onClick={() => setUploadOpen(true)}
          >
            ＋ 买量素材入库
          </button>
        </div>
      </div>
      {tab === "feed" && (
        <>
          <div className={styles.filterPanel}>
            <div className={styles.toolbar}>
              <label className={styles.searchField}>
                <span className="sr-only">搜索素材</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索标题、平台或题材"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="清空搜索"
                    onClick={() => setQuery("")}
                  >
                    ×
                  </button>
                )}
              </label>
              <select
                value={mediaKind}
                onChange={(e) => setMediaKind(e.target.value)}
                aria-label="媒体类型"
              >
                <option>全部媒体</option>
                <option>图片</option>
                <option>视频</option>
              </select>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                aria-label="投放平台"
              >
                <option>全部平台</option>
                {[
                  ...new Set(materials.map((v) => v.platform).filter(Boolean)),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="语种"
              >
                <option>全部语种</option>
                {[...new Set(materials.map((v) => v.language))].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="素材类型"
              >
                <option>全部类型</option>
                <option>未判定</option>
                <option>原剧拼接</option>
                <option>解说</option>
                <option>AI前贴</option>
                <option>海报图片</option>
              </select>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                aria-label="受众方向"
              >
                <option>全部受众</option>
                <option>男频</option>
                <option>女频</option>
                <option>通用</option>
                <option>未判定</option>
              </select>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                aria-label="题材"
              >
                <option>全部题材</option>
                {[
                  ...new Set(
                    materials.flatMap((v) => v.genres).filter(Boolean),
                  ),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <select
                aria-label="按分析状态筛选"
                value={analysisFilter}
                onChange={(e) => setAnalysisFilter(e.target.value)}
              >
                <option>全部分析状态</option>
                <option>仅看分析完成</option>
              </select>
            </div>
            <details className={styles.advancedFilters}>
              <summary>投放指标与入库时间</summary>
              <div>
                <label>
                  消耗范围
                  <input
                    type="number"
                    min="0"
                    value={spendMin}
                    onChange={(e) => setSpendMin(e.target.value)}
                    placeholder="最低"
                  />
                  <input
                    type="number"
                    min="0"
                    value={spendMax}
                    onChange={(e) => setSpendMax(e.target.value)}
                    placeholder="最高"
                  />
                </label>
                <label>
                  曝光范围
                  <input
                    type="number"
                    min="0"
                    value={exposureMin}
                    onChange={(e) => setExposureMin(e.target.value)}
                    placeholder="最低"
                  />
                  <input
                    type="number"
                    min="0"
                    value={exposureMax}
                    onChange={(e) => setExposureMax(e.target.value)}
                    placeholder="最高"
                  />
                </label>
                <label>
                  跑量天数
                  <input
                    type="number"
                    min="0"
                    value={daysMin}
                    onChange={(e) => setDaysMin(e.target.value)}
                    placeholder="最低"
                  />
                  <input
                    type="number"
                    min="0"
                    value={daysMax}
                    onChange={(e) => setDaysMax(e.target.value)}
                    placeholder="最高"
                  />
                </label>
                <div
                  className={styles.inboundDateFilter}
                  role="group"
                  aria-label="按入库时间筛选"
                >
                  <span>入库时间</span>
                  <input
                    aria-label="入库开始日期"
                    type="date"
                    value={inboundStart}
                    max={inboundEnd || undefined}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInboundStart(value);
                      if (inboundEnd && value > inboundEnd)
                        setInboundEnd(value);
                    }}
                  />
                  <i>至</i>
                  <input
                    aria-label="入库结束日期"
                    type="date"
                    value={inboundEnd}
                    min={inboundStart || undefined}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInboundEnd(value);
                      if (inboundStart && value < inboundStart)
                        setInboundStart(value);
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setType("全部类型");
                    setMediaKind("全部媒体");
                    setPlatform("全部平台");
                    setLanguage("全部语种");
                    setAudience("全部受众");
                    setGenre("全部题材");
                    setAnalysisFilter("全部分析状态");
                    setInboundStart("");
                    setInboundEnd("");
                    setSpendMin("");
                    setSpendMax("");
                    setExposureMin("");
                    setExposureMax("");
                    setDaysMin("");
                    setDaysMax("");
                  }}
                >
                  清空筛选
                </button>
              </div>
            </details>
            <p className={styles.resultCount}>
              当前显示 {filtered.length} 条，共 {counts.feed} 条跑量素材
            </p>
          </div>
          {error ? (
            <State title="素材加载失败" detail={error} />
          ) : filtered.length ? (
            <MaterialTable
              items={filtered}
              favorites={favorites}
              deletingId={deletingId}
              openingId={openingId}
              reanalyzingId={reanalyzingId}
              onFavorite={(item) => favorite(item.id)}
              onDelete={(item) => void removeMaterial(item)}
              onOpen={(item) => void open(item)}
              onReanalyze={(item) => void reanalyze(item)}
            />
          ) : (
            <State
              title={materials.length ? "没有符合条件的素材" : "还没有买量素材"}
              detail={
                materials.length
                  ? "请调整筛选条件或清空筛选。"
                  : "使用右上角入口上传图片或视频素材。"
              }
            />
          )}
        </>
      )}
      {tab === "aiPrefaces" && (
        <MaterialLibraryPanelV2
          kind="ai_preface"
          assets={aiPrefaces}
          flash={flash}
          onDeleted={() => void refresh()}
          onSelectForReplication={onSelectForReplication}
        />
      )}
      {tab === "narrations" && (
        <MaterialLibraryPanelV2
          kind="narration"
          assets={narrations}
          flash={flash}
          onDeleted={() => void refresh()}
        />
      )}
      {tab === "replicate" &&
        (requestedPrefaceAsset ? (
          <LibraryAnalysisPage
            kind="ai_preface"
            asset={requestedPrefaceAsset}
            onBack={() => exitLibraryAnalysis("aiPrefaces")}
            flash={flash}
            allAssets={libraryAssets}
            workflow={requestedLibraryWorkflow}
          />
        ) : (
          <State
            title="未找到前贴素材"
            detail="该素材可能已删除，请返回 AI 前贴库选择其他素材。"
          />
        ))}
      {tab === "narrationPreview" &&
        (requestedNarrationAsset ? (
          <LibraryAnalysisPage
            kind="narration"
            asset={requestedNarrationAsset}
            onBack={() => exitLibraryAnalysis("narrations")}
            flash={flash}
            allAssets={libraryAssets}
            workflow={requestedLibraryWorkflow}
          />
        ) : (
          <State
            title="未找到解说素材"
            detail="该素材可能已删除，请返回解说库选择其他素材。"
          />
        ))}
      {tab === "prototypes" &&
        (prototypes.length ? (
          <HookPrototypePanel
            groups={prototypes}
            onFactory={(hook) => onOpenFactory?.(hook)}
            onReview={selectHookReview}
          />
        ) : (
          <State
            title="暂无钩子资产"
            detail="素材分析完成并定位到可复用片段后，钩子会按原型展示在这里。"
          />
        ))}
      {tab === "review" && (
        <section className={styles.reviewHub}>
          <header>
            <div>
              <span className={styles.eyebrow}>HUMAN REVIEW</span>
              <h2>人工复核</h2>
              <p>先确认素材是否包含独立前贴与独立解说，再处理内容标签和钩子边界。</p>
            </div>
            <div className={styles.reviewScopeTabs} role="tablist" aria-label="人工复核类型">
              <button type="button" role="tab" aria-selected={reviewScope === "types"} onClick={() => setReviewScope("types")}>类型分流 <em>{typeReviewItems.length}</em></button>
              <button type="button" role="tab" aria-selected={reviewScope === "content"} onClick={() => setReviewScope("content")}>内容证据 <em>{contentReviewItems.length}</em></button>
              <button type="button" role="tab" aria-selected={reviewScope === "hooks"} onClick={() => setReviewScope("hooks")}>钩子边界 <em>{hookReviewItems.length}</em></button>
            </div>
          </header>
          {reviewScope === "hooks" && hookReviewItems.length ? (
          <HookReview
            hooks={hooks}
            selectedId={selectedHookId || hookReviewItems[0]?.id}
            onSelect={selectHookReview}
            onSaved={() => void refresh()}
            flash={flash}
          />
        ) : reviewScope === "types" && typeReviewItems.length ? (
          <TypeReview
            items={typeReviewItems}
            onSaved={() => void refresh(undefined, true)}
            flash={flash}
          />
        ) : reviewScope === "content" && contentReviewItems.length ? (
          <Review
            items={contentReviewItems}
            onSaved={() => void refresh()}
            flash={flash}
          />
        ) : (
          <State
            title={reviewScope === "types" ? "暂无待分流的素材类型" : reviewScope === "content" ? "暂无待复核的内容证据" : "暂无待复核的钩子边界"}
            detail="新的不确定结果会自动出现在这里。"
          />
        )}
        </section>
      )}
      {uploadOpen && (
        <Upload
          onClose={() => setUploadOpen(false)}
          onSaved={(item) => {
            mergeMaterials([item]);
            setTotalItems((value) => Math.max(value + 1, materials.length + 1));
            window.setTimeout(() => void refresh(), 250);
          }}
        />
      )}
      {toast && <div className={styles.toast}>✓ {toast}</div>}
    </section>
  );
}

const canonicalHookType = (hook: HookAsset) => {
  const raw = `${hook.hookType} ${hook.contentTags.join(" ")}`.toLowerCase();
  if (/cliff|suspense|悬念|危机/.test(raw)) return "悬念预告";
  if (/reveal|identity|身份|真相|揭/.test(raw)) return "身份揭示";
  if (/conflict|confront|outburst|冲突|对抗|争执/.test(raw)) return "强冲突";
  if (/emotion|breakdown|情感|情绪|虐/.test(raw)) return "情绪拉升";
  if (/decision|payoff|打脸|爽/.test(raw)) return "爽点兑现";
  if (/contrast|反差/.test(raw)) return "反差";
  return "信息差";
};
const hookAttribution = (hook: HookAsset) => {
  if (hook.sourceClass === "narration_opening") return "解说开场";
  if (
    hook.hookAssemblyType === "同剧外搭" ||
    hook.hookSourceStatus === "已确认同剧"
  )
    return "同剧高光前置";
  if (
    hook.hookAssemblyType === "跨剧外搭" ||
    hook.hookSourceStatus === "已确认外搭"
  )
    return "跨剧／外部外搭";
  if (
    hook.hookAssemblyType === "外搭来源待确认" ||
    ["疑似外搭", "来源未知"].includes(hook.hookSourceStatus)
  )
    return "外搭来源待确认";
  return "原生正片开场";
};
function HookPrototypePanel({
  groups,
  onFactory,
  onReview,
}: {
  groups: Array<{ label: string; items: HookAsset[] }>;
  onFactory: (hook: HookAsset) => void;
  onReview: (id: string) => void;
}) {
  const [sourceClass, setSourceClass] = useState("全部来源"),
    [attribution, setAttribution] = useState("全部归属"),
    [hookType, setHookType] = useState("全部类型"),
    [theme, setTheme] = useState("全部题材"),
    [relation, setRelation] = useState("全部关系"),
    [emotion, setEmotion] = useState("全部情绪"),
    [boundary, setBoundary] = useState("全部边界"),
    [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc"),
    [advanced, setAdvanced] = useState(false);
  const all = groups.flatMap((group) => group.items);
  const ontologyValues = (dimension: string) =>
    [
      ...new Set(
        all.flatMap((hook) =>
          (hook.ontologyTags ?? [])
            .filter(
              (tag) => tag.dimension === dimension && isKnownOntologyTag(tag),
            )
            .map((tag) => tag.label),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const hookTypes = [...new Set(all.map(canonicalHookType))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  const themes = ontologyValues("theme"),
    relations = ontologyValues("relation"),
    emotions = ontologyValues("emotion");
  const hasOntology = (hook: HookAsset, dimension: string, label: string) =>
    label.startsWith("全部") ||
    (hook.ontologyTags ?? []).some(
      (tag) =>
        tag.dimension === dimension &&
        isKnownOntologyTag(tag) &&
        tag.label === label,
    );
  const visible = all.filter(
    (hook) =>
      (sourceClass === "全部来源" || hook.sourceClass === sourceClass) &&
      (attribution === "全部归属" || hookAttribution(hook) === attribution) &&
      (hookType === "全部类型" || canonicalHookType(hook) === hookType) &&
      hasOntology(hook, "theme", theme) &&
      hasOntology(hook, "relation", relation) &&
      hasOntology(hook, "emotion", emotion) &&
      (boundary === "全部边界" || hook.boundaryStatus === boundary),
  ).sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "") || 0;
    const rightTime = Date.parse(right.createdAt || "") || 0;
    return sortOrder === "asc" ? leftTime - rightTime : rightTime - leftTime;
  });
  const activeAdvanced = [
    relation !== "全部关系",
    emotion !== "全部情绪",
    boundary !== "全部边界",
  ].filter(Boolean).length;
  const reset = () => {
    setSourceClass("全部来源");
    setAttribution("全部归属");
    setHookType("全部类型");
    setTheme("全部题材");
    setRelation("全部关系");
    setEmotion("全部情绪");
    setBoundary("全部边界");
  };
  return (
    <div className={styles.hookPrototypePage} aria-label="钩子原型库">
      <div className={styles.hookPrototypeToolbar}>
        <div className={styles.prototypePrimaryFilters}>
          <label>
            <span>资产来源</span>
            <select
              value={sourceClass}
              onChange={(event) => setSourceClass(event.target.value)}
            >
              <option>全部来源</option>
              <option value="external_material">买量素材开场</option>
              <option value="narration_opening">解说开场</option>
            </select>
          </label>
          <label>
            <span>钩子归属</span>
            <select
              value={attribution}
              onChange={(event) => setAttribution(event.target.value)}
            >
              <option>全部归属</option>
              <option>同剧高光前置</option>
              <option>跨剧／外部外搭</option>
              <option>外搭来源待确认</option>
              <option>原生正片开场</option>
            </select>
          </label>
          <label>
            <span>钩子类型</span>
            <select
              value={hookType}
              onChange={(event) => setHookType(event.target.value)}
            >
              <option>全部类型</option>
              {hookTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>题材主题</span>
            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
            >
              <option>全部题材</option>
              {themes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={advanced ? styles.prototypeAdvancedActive : ""}
            onClick={() => setAdvanced((value) => !value)}
          >
            高级筛选{activeAdvanced ? ` · ${activeAdvanced}` : ""}
          </button>
        </div>
      </div>
      {advanced && (
        <div className={styles.prototypeAdvancedFilters}>
          <div>
            <label>
              <span>人物关系</span>
              <select
                value={relation}
                onChange={(event) => setRelation(event.target.value)}
              >
                <option>全部关系</option>
                {relations.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>主导情绪</span>
              <select
                value={emotion}
                onChange={(event) => setEmotion(event.target.value)}
              >
                <option>全部情绪</option>
                {emotions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>边界状态</span>
              <select
                value={boundary}
                onChange={(event) => setBoundary(event.target.value)}
              >
                <option>全部边界</option>
                <option value="verified">边界已验证</option>
                <option value="unverified">边界待复核</option>
                <option value="rejected">边界已驳回</option>
              </select>
            </label>
          </div>
          <p>
            高级维度来自现有 relation、emotion
            标签；边界状态属于生产门禁，不新增内容标签。
          </p>
        </div>
      )}
      <div className={styles.prototypeResultBar}>
        <span>
          共 <b>{visible.length}</b> 个钩子实例 ·{" "}
          <b>{new Set(visible.map(canonicalHookType)).size}</b> 种原型
        </span>
        {visible.length !== all.length && (
          <button type="button" onClick={reset}>
            清除筛选
          </button>
        )}
        <button type="button" onClick={() => setSortOrder((value) => value === "asc" ? "desc" : "asc")} aria-label={sortOrder === "asc" ? "按入库时间倒序" : "按入库时间正序"} title={sortOrder === "asc" ? "入库时间倒序" : "入库时间正序"}>↕</button>
      </div>
      <div className={styles.hookAssetGrid}>
        {visible.map((hook) => (
          <HookAssetCard
            key={hook.id}
            hook={hook}
            onFactory={() => onFactory(hook)}
            onReview={() => onReview(hook.id)}
          />
        ))}
      </div>
      {!visible.length && (
        <State
          title="没有符合筛选条件的钩子"
          detail="调整来源或主题标签后重试。"
        />
      )}
    </div>
  );
}

function HookAssetCard({
  hook,
  onFactory,
  onReview,
}: {
  hook: HookAsset;
  onFactory: () => void;
  onReview: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    durationSeconds = Math.max(0, hook.end - hook.start),
    eligible =
      hook.sourceClass === "external_material" &&
      hook.boundaryStatus === "verified" &&
      ["已获授权可制作", "已获授权可投放"].includes(hook.rightsStatus);
  const startPreview = () => {
    const element = video.current;
    if (!element) return;
    element.dataset.hovering = "true";
    element.currentTime = hook.start;
    void element.play().catch(() => undefined);
  };
  const stopPreview = () => {
    const element = video.current;
    if (!element) return;
    element.dataset.hovering = "false";
    element.pause();
    element.currentTime = hook.start;
  };
  const compactTags=[canonicalHookType(hook),...["theme","relation","emotion"].flatMap((dimension) =>
      (hook.ontologyTags ?? [])
        .filter((tag) => tag.dimension === dimension && isKnownOntologyTag(tag))
        .slice(0, 1)
        .map((tag) => tag.label),
    ),
  ]
    .filter(
      (value, index, items) => Boolean(value) && items.indexOf(value) === index,
    )
    .slice(0, 4);
  return (
    <article className={styles.hookAssetCard}>
      <div
        className={styles.hookAssetPreview}
        onMouseEnter={startPreview}
        onMouseLeave={stopPreview}
      >
        {hook.materialVideoUrl ? (
          <video
            ref={video}
            src={`${hook.materialVideoUrl}#t=${hook.start},${hook.end}`}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = hook.start;
            }}
            onCanPlay={(event) => {
              if (event.currentTarget.dataset.hovering === "true")
                void event.currentTarget.play().catch(() => undefined);
            }}
            onSeeking={(event) => {
              if (
                event.currentTarget.currentTime < hook.start ||
                event.currentTarget.currentTime > hook.end
              )
                event.currentTarget.currentTime = hook.start;
            }}
            onTimeUpdate={(event) => {
              if (event.currentTarget.currentTime >= hook.end) stopPreview();
            }}
          />
        ) : (
          <span>无可播放来源</span>
        )}
        <button type="button" onClick={startPreview}>
          ▶ 预览钩子 {duration(hook.start)}–{duration(hook.end)}
        </button>
      </div>
      <div className={styles.hookAssetBody}>
        <header>
          <span>{hookAttribution(hook)}</span>
          <em
            className={
              hook.boundaryStatus === "verified"
                ? styles.hookVerified
                : styles.hookNeedsReview
            }
          >
            {hook.boundaryStatus === "verified" ? "边界已验证" : "边界待复核"}
          </em>
        </header>
        <button
          type="button"
          className={styles.hookReviewLink}
          onClick={onReview}
        >
          <span>进入人工复核 →</span>
        </button>
        <p>
          {duration(hook.start)}–{duration(hook.end)} · {duration(durationSeconds)}
        </p>
        <div className={styles.chips} aria-label="核心标签">
          {compactTags.map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
        <footer>
          <small>{hook.rightsStatus}</small>
          <button
            type="button"
            disabled={!eligible}
            title={
              !eligible
                ? "仅允许边界已验证且授权可制作的外搭钩子进入该模式"
                : undefined
            }
            onClick={onFactory}
          >
            用此钩子创作 →
          </button>
        </footer>
      </div>
    </article>
  );
}

const missingNarrationCopy = "未检测到独立解说口播";
const narrationOpeningSegments = (item: Material) => {
  const creative = item.analysisV2?.creative;
  if (!creative) return [];
  const verifiedSegments = (creative.narrationSegments || [])
    .filter((segment) => segment.end > segment.start && segment.verification === "verified")
    .sort((left, right) => left.start - right.start);
  if (verifiedSegments.length) return verifiedSegments;
  // ASR transcript rows are evidence only; they can contain character
  // dialogue and must never be promoted to narration without a semantic
  // independent-voiceover decision.
  return [];
};
function MaterialTable({
  items,
  favorites,
  deletingId,
  openingId,
  reanalyzingId,
  onFavorite,
  onDelete,
  onOpen,
  onReanalyze,
}: {
  items: Material[];
  favorites: string[];
  deletingId: string;
  openingId: string;
  reanalyzingId: string;
  onFavorite: (item: Material) => void;
  onDelete: (item: Material) => void;
  onOpen: (item: Material) => void;
  onReanalyze: (item: Material) => void;
}) {
  return (
    <div
      className={styles.materialTableWrap}
      role="table"
      aria-label="跑量素材列表"
    >
      <div
        className={`${styles.materialTableRow} ${styles.materialTableHead}`}
        role="row"
      >
        <span>素材</span>
        <span>分析状态 / 类型</span>
        <span>素材标签</span>
        <span>ADX 投放</span>
        <span>来源 / 平台</span>
        <span>解说口播文案</span>
        <span>操作</span>
      </div>
      {items.map((item, index) => (
        <MaterialTableRow
          key={item.id}
          item={item}
          ordinal={index + 1}
          favorite={favorites.includes(item.id)}
          deleting={deletingId === item.id}
          opening={openingId === item.id}
          reanalyzing={reanalyzingId === item.id}
          onFavorite={() => onFavorite(item)}
          onDelete={() => onDelete(item)}
          onOpen={() => onOpen(item)}
          onReanalyze={() => onReanalyze(item)}
        />
      ))}
    </div>
  );
}

function MaterialTableRow({
  item,
  ordinal,
  favorite,
  deleting,
  opening,
  reanalyzing,
  onFavorite,
  onDelete,
  onOpen,
  onReanalyze,
}: {
  item: Material;
  ordinal: number;
  favorite: boolean;
  deleting: boolean;
  opening: boolean;
  reanalyzing: boolean;
  onFavorite: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onReanalyze: () => void;
}) {
  const url = createInspirationMaterialVideoUrl(item),
    progress = Math.max(
      0,
      Math.min(100, Math.round(item.analysisProgress ?? 0)),
    ),
    status = item.analysisStatus ?? "idle";
  const spend = item.adxMetrics.spend,
    impressions = item.adxMetrics.impressions ?? item.exposure;
  const statusLabel =
    (
      {
        queued: "排队中",
        running: "分析中",
        succeeded: "分析完成",
        failed: "分析失败",
        idle: "待分析",
      } as Record<string, string>
    )[status] || "待分析";
  const statusClass =
    status === "succeeded"
      ? styles.materialStatusDone
      : status === "failed"
        ? styles.materialStatusFailed
        : status === "running" || status === "queued"
          ? styles.materialStatusActive
          : "";
  const tagLabels = (items: MaterialTag[] | undefined) =>
    items?.map((value) => value.label).filter(Boolean) ?? [];
  const creative = item.analysisV2?.creative;
  const peopleAreHook =
    creative?.hook?.mechanisms?.some((value) =>
      /身份|反差|人物|关系|亲情|背叛/.test(value.label || ""),
    ) ?? false;
  const hasVerifiedAiPreface =
    creative?.openingAssetOrigin?.label === "AI生成前贴" &&
    creative?.openingAssetOrigin?.verification === "verified" &&
    Array.isArray(creative?.openingAssetOrigin?.evidence) &&
    creative.openingAssetOrigin.evidence.length > 0;
  const hasNarrationSegments =
    (creative?.narrationSegments || []).some(
      (segment) => segment.verification === "verified" && segment.end > segment.start,
    );
  const primaryMaterialType = hasVerifiedAiPreface
    ? "AI前贴"
    : hasNarrationSegments
      ? "解说"
      : item.type;
  const materialTypes = [
    item.mediaKind === "图片" ? "海报图片" : primaryMaterialType,
    hasVerifiedAiPreface && hasNarrationSegments ? "解说" : "",
  ].filter(
    (value, index, all) =>
      Boolean(value) && value !== "未判定" && all.indexOf(value) === index,
  );
  const tags = [
    ...materialTypes.map((value) => `类型 · ${value}`),
    item.language && `语种 · ${item.language}`,
    item.audienceType && `受众 · ${item.audienceType}`,
    ...(peopleAreHook
      ? tagLabels(item.analysisV2?.content.characters)
          .slice(0, 2)
          .map((value) => `人物 · ${value}`)
      : []),
    ...item.genres.map((value) => `题材 · ${value}`),
    ...tagLabels(item.analysisV2?.content.themes).map(
      (value) => `短剧分类 · ${value}`,
    ),
    ...tagLabels(item.analysisV2?.content.storyBeats).map(
      (value) => `剧情 · ${value}`,
    ),
    (item.hookType || creative?.hook?.hookType) &&
      `钩子 · ${item.hookType || creative?.hook?.hookType}`,
  ]
    .filter(
      (value, index, all) =>
        Boolean(value) &&
        !value.includes("未判定") &&
        !value.includes("未知语种") &&
        all.indexOf(value) === index,
    )
    .slice(0, 12);
  const narrationSegments = materialTypes.includes("解说")
    ? narrationOpeningSegments(item)
    : [];
  const openingText = materialTypes.includes("解说")
    ? narrationSegments.length
      ? narrationSegments.map((segment) => segment.text).join(" ")
      : missingNarrationCopy
    : "—";
  const [previewing, setPreviewing] = useState(false);
  return (
    <div className={styles.materialTableRow} role="row">
      <div className={styles.materialIdentity} role="cell">
        <div className={styles.materialThumb}>
          {item.coverUrl ? (
            <img src={item.coverUrl} alt="" />
          ) : url && item.mediaKind === "图片" ? (
            <img src={url} alt="" />
          ) : url ? (
            <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
          ) : (
            <span>无预览</span>
          )}
        </div>
        <div>
          <b>{item.title}</b>
          <small>
            序号 {String(ordinal).padStart(3, "0")} · {item.mediaKind}
            {item.media?.duration ? ` · ${duration(item.media.duration)}` : ""}
          </small>
        </div>
      </div>
      <div className={`${styles.materialStatus} ${statusClass}`} role="cell">
        <b>
          <i /> {statusLabel}
        </b>
        <strong>
          {done(item)
            ? materialTypes.join(" / ") || "类型待核对"
            : item.analysisStage || "类型分析中"}
        </strong>
        {!done(item) && <small>{progress}%</small>}
        <em>
          <span style={{ width: `${progress}%` }} />
        </em>
      </div>
      <div className={styles.materialTags} role="cell">
        {tags.length ? (
          <>
            {tags.slice(0, 6).map((tag) => (
              <em key={tag}>
                {tag.replace(
                  /^(类型|语种|受众|人物|题材|短剧分类|剧情|钩子) · /,
                  "",
                )}
              </em>
            ))}
            {tags.length > 6 && (
              <em title={tags.slice(6).join("、")}>+{tags.length - 6}</em>
            )}
          </>
        ) : (
          <small>分析完成后自动生成</small>
        )}
      </div>
      <div className={styles.materialMetrics} role="cell">
        <b>
          {spend == null
            ? "消耗 —"
            : `${item.adxMetrics.currency || ""} ${spend.toLocaleString()}`}
        </b>
        <small>曝光 {impressions ? impressions.toLocaleString() : "—"}</small>
        <small>跑量 {(item.adxMetrics.days ?? item.days) || "—"} 天</small>
      </div>
      <div className={styles.materialSourceCell} role="cell">
        <b>{item.source || "未知来源"}</b>
        <small>{item.platform || "未知平台"}</small>
      </div>
      <button
        type="button"
        className={styles.materialOpeningCopy}
        role="cell"
        title={narrationSegments.length ? "点击复制前 30 秒解说口播" : undefined}
        disabled={!narrationSegments.length}
        onClick={() => void navigator.clipboard?.writeText(openingText)}
      >
        {openingText}
      </button>
      <div className={styles.materialActions} role="cell">
        {url && (
          <>
            <button type="button" onClick={() => setPreviewing(true)}>
              预览
            </button>
            <a href={url} download={item.media?.name || item.title}>
              下载
            </a>
          </>
        )}
        <button
          type="button"
          disabled={reanalyzing || opening}
          onClick={onReanalyze}
        >
          {reanalyzing ? "提交中…" : "重新分析"}
        </button>
        <button type="button" onClick={onFavorite}>
          {favorite ? "取消收藏" : "收藏"}
        </button>
        <button
          type="button"
          className={styles.materialDeleteAction}
          disabled={deleting || opening}
          onClick={onDelete}
        >
          {deleting ? "删除中…" : "删除"}
        </button>
      </div>
      {previewing && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewing(false);
          }}
        >
          <section className={styles.videoPreviewModal}>
            <header>
              <b>{item.title}</b>
              <button type="button" onClick={() => setPreviewing(false)}>
                ×
              </button>
            </header>
            {url ? (
              item.mediaKind === "图片" ? (
                <img src={url} alt={item.title} />
              ) : (
                <video src={url} controls autoPlay playsInline />
              )
            ) : (
              <p>素材加载失败，请检查文件是否仍然存在。</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MaterialCard({
  item,
  favorite,
  deleting,
  opening,
  reanalyzing,
  onFavorite,
  onDelete,
  onOpen,
  onReanalyze,
}: {
  item: Material;
  favorite: boolean;
  deleting: boolean;
  opening: boolean;
  reanalyzing: boolean;
  onFavorite: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onReanalyze: () => void;
}) {
  const url = createInspirationMaterialVideoUrl(item);
  const [previewing, setPreviewing] = useState(false);
  const progress = Math.max(
      0,
      Math.min(100, Math.round(item.analysisProgress ?? 0)),
    ),
    status = item.analysisStatus ?? "idle";
  const spend = item.adxMetrics.spend,
    impressions = item.adxMetrics.impressions ?? item.exposure;
  return (
    <article className={styles.card}>
      <div className={`${styles.cover} ${styles[item.color]}`}>
        {item.coverUrl ? (
          <img
            className={styles.materialPoster}
            src={item.coverUrl}
            alt={item.title}
          />
        ) : url && item.mediaKind === "图片" ? (
          <img className={styles.materialPoster} src={url} alt={item.title} />
        ) : url ? (
          <video
            className={styles.materialPoster}
            src={`${url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
          />
        ) : null}
        {url && (
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className={styles.previewButton}
            aria-label={`预览 ${item.title}`}
          >
            {item.mediaKind === "图片" ? "⌕" : "▶"}
          </button>
        )}
        <span className={styles.source}>
          {item.source} · {item.platform}
        </span>
        <em>
          {item.mediaKind === "图片"
            ? "图片"
            : item.media
              ? duration(item.media.duration)
              : "无片源"}
        </em>
        <button
          className={`${styles.favorite} ${favorite ? styles.favorited : ""}`}
          onClick={onFavorite}
          aria-label={favorite ? "取消收藏" : "收藏素材"}
        >
          {favorite ? "♥" : "♡"}
        </button>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.tags}>
          <span>{item.mediaKind}</span>
          <span>{item.audienceType}</span>
          {item.genres.slice(0, 2).map((value) => (
            <span key={value}>{value}</span>
          ))}
          <span>{item.language}</span>
        </div>
        <h3>{item.title}</h3>
        <div className={styles.analysisTypeTag}>素材类型：{item.type}</div>
        <div className={styles.metricStrip}>
          <span>
            <small>ADX 消耗</small>
            <b>
              {spend == null
                ? "—"
                : `${item.adxMetrics.currency || ""} ${spend.toLocaleString()}`}
            </b>
          </span>
          <span>
            <small>曝光</small>
            <b>{impressions ? impressions.toLocaleString() : "—"}</b>
          </span>
          <span>
            <small>跑量</small>
            <b>{(item.adxMetrics.days ?? item.days) || "—"} 天</b>
          </span>
        </div>
        <div
          className={styles.materialProgress}
          data-status={status}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div>
            <span>
              {item.analysisStage ||
                {
                  queued: "待分析",
                  running: "分析中",
                  succeeded: "已完成",
                  failed: "失败",
                  idle: "尚未分析",
                }[status]}
            </span>
            <b>{progress}%</b>
          </div>
          <i>
            <em style={{ width: `${progress}%` }} />
          </i>
        </div>
        <div className={styles.cardFooter}>
          <span>{item.captured}</span>
          <div>
            {url && (
              <>
                <button type="button" onClick={() => setPreviewing(true)}>
                  预览
                </button>
                <a href={url} download={item.media?.name || item.title}>
                  下载
                </a>
              </>
            )}
            <button
              className={styles.deleteAction}
              disabled={deleting || opening}
              onClick={onDelete}
            >
              {deleting ? "删除中…" : "删除"}
            </button>
            <button
              className={styles.analysisLink}
              disabled={reanalyzing || opening}
              onClick={onReanalyze}
            >
              {reanalyzing ? "提交中…" : "重新分析"}
            </button>
          </div>
        </div>
      </div>
      {previewing && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewing(false);
          }}
        >
          <section className={styles.videoPreviewModal}>
            <header>
              <b>{item.title}</b>
              <button type="button" onClick={() => setPreviewing(false)}>
                ×
              </button>
            </header>
            {url ? (
              item.mediaKind === "图片" ? (
                <img src={url} alt={item.title} />
              ) : (
                <video src={url} controls autoPlay playsInline />
              )
            ) : (
              <p>素材加载失败，请检查文件是否仍然存在。</p>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

type EvidenceItem = NonNullable<Material["analysisV2"]>["evidence"][number];
const evidenceGroup = (kind: string) => {
  const value = kind.toLowerCase();
  if (value.includes("asr") || value.includes("transcript")) return "对白";
  if (value.includes("ocr") || value.includes("subtitle")) return "字幕";
  if (value.includes("scene") || value.includes("shot")) return "镜头";
  if (value.includes("audio") || value.includes("silence")) return "音频";
  return "画面";
};
const hasChinese = (value?: string) =>
  Boolean(
    value && /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value),
  );
const evidenceMeaning = (item: EvidenceItem) => {
  if (hasChinese(item.observation)) return item.observation!;
  if (hasChinese(item.translation)) return item.translation!;
  if (hasChinese(item.text) && !/^(?:镜头|画面)\s*\d+$/u.test(item.text!))
    return item.text!;
  return "该时间点仅有技术定位信息，尚未形成可支撑剧情结论的事实证据。";
};
const evidenceClassLabel = (item: EvidenceItem) =>
  item.evidenceClass === "narrative"
    ? "关键剧情证据"
    : item.evidenceClass === "auxiliary"
      ? "辅助识别证据"
      : "技术定位点";
function EvidencePanel({
  items,
  videoUrl,
}: {
  items: EvidenceItem[];
  videoUrl?: string;
}) {
  const [group, setGroup] = useState("全部"),
    [expanded, setExpanded] = useState(false),
    groups = ["对白", "字幕", "画面", "镜头", "音频"],
    counts = new Map(
      groups.map((label) => [
        label,
        items.filter((item) => evidenceGroup(item.kind) === label).length,
      ]),
    ),
    filtered =
      group === "全部"
        ? items
        : items.filter((item) => evidenceGroup(item.kind) === group),
    visible = expanded ? filtered : filtered.slice(0, 12);
  const verificationLabel = (value?: string) =>
    value === "verified"
      ? "已验证"
      : value === "observed"
        ? "已识别"
        : value === "unverified" || value === "needs_review"
          ? "待确认"
          : value || "未标记";
  return (
    <>
      {items.length ? (
        <>
          <div className={styles.evidenceSummary}>
            <button
              className={group === "全部" ? styles.evidenceActive : ""}
              onClick={() => {
                setGroup("全部");
                setExpanded(false);
              }}
            >
              <b>{items.length}</b>
              <span>全部证据</span>
            </button>
            {groups
              .filter((label) => (counts.get(label) ?? 0) > 0)
              .map((label) => (
                <button
                  key={label}
                  className={group === label ? styles.evidenceActive : ""}
                  onClick={() => {
                    setGroup(label);
                    setExpanded(false);
                  }}
                >
                  <b>{counts.get(label)}</b>
                  <span>{label}</span>
                </button>
              ))}
          </div>
          {videoUrl ? (
            <div className={styles.evidenceNotice}>
              点击时间码可回看原片；关键证据只保留能够直接支撑剧情结论的事实。
            </div>
          ) : (
            <div className={styles.evidenceNotice}>
              当前素材没有可播放片源，仍可按时间码核对证据。
            </div>
          )}
          <div className={styles.evidenceTimeline}>
            {visible.map((item, index) => {
              const key = item.id ?? String(index),
                original =
                  item.sourceText ||
                  (item.text && !hasChinese(item.text) ? item.text : "");
              return (
                <article key={key}>
                  <div className={styles.evidenceMeta}>
                    <time>
                      {Math.abs(item.end - item.start) < 0.01
                        ? duration(item.start)
                        : `${duration(item.start)}–${duration(item.end)}`}
                    </time>
                    <i>{evidenceGroup(item.kind)}</i>
                  </div>
                  <div className={styles.evidenceCopy}>
                    <small>{evidenceClassLabel(item)}</small>
                    <b>{evidenceMeaning(item)}</b>
                    {item.supports && (
                      <span>
                        <strong>支撑结论：</strong>
                        {item.supports}
                      </span>
                    )}
                    {original && (
                      <details>
                        <summary>查看原始依据</summary>
                        <span lang="auto">{original}</span>
                      </details>
                    )}
                  </div>
                  <div className={styles.evidenceStatus}>
                    <small>
                      {pct(item.confidence)}% ·{" "}
                      {verificationLabel(item.verification)}
                    </small>
                    {videoUrl && (
                      <a
                        href={`${videoUrl}#t=${Math.max(0, item.start)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ▶ 回看片段
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {filtered.length > 12 && (
            <button
              className={styles.evidenceToggle}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? "收起证据"
                : "展开全部 " + filtered.length + " 条证据"}
            </button>
          )}
        </>
      ) : (
        <InlineEmpty text="没有可展示的证据记录" />
      )}
    </>
  );
}

const verificationLabel = (value?: string) =>
  value === "verified"
    ? "已验证"
    : value === "observed"
      ? "已识别"
      : value === "needs_review"
        ? "待复核"
        : value === "rejected"
          ? "已驳回"
          : "待确认";

type StoryPhase = NonNullable<
  Material["analysisV2"]
>["creative"]["timeline"][number];

const concreteDramaticDrivers = (
  phases: StoryPhase[],
  emotions: MaterialTag[],
  conflicts: MaterialTag[],
) => {
  const usable = phases.filter((phase) => phase.label || phase.description);
  const opening = usable[0],
    middle = usable[Math.min(1, Math.max(0, usable.length - 1))],
    ending = usable.at(-1);
  const emotionLabels = emotions
    .map((tag) => tag.label)
    .filter(Boolean)
    .slice(0, 3);
  const conflictLabels = conflicts
    .map((tag) => tag.label)
    .filter(Boolean)
    .slice(0, 3);
  const emotion =
    opening && ending
      ? `${opening.label}引发人物情绪变化${ending !== opening ? `，${ending.label}进一步抬高紧张感` : ""}${emotionLabels.length ? `，主导情绪为${emotionLabels.join("、")}` : ""}。`
      : emotionLabels.length
        ? `人物的${emotionLabels.join("、")}推动剧情发展，但具体诱因仍需结合原片复核。`
        : "尚未识别出能够说明情绪起因和变化的完整剧情节点。";
  const chain = [opening, middle, ending]
    .filter(
      (phase, index, array): phase is StoryPhase =>
        Boolean(phase) && array.indexOf(phase) === index,
    )
    .map((phase) => phase.label);
  const conflict =
    chain.length >= 2
      ? `${chain.join(" → ")}，形成持续升级的行动与关系冲突${conflictLabels.length ? `（${conflictLabels.join("、")}）` : ""}。`
      : conflictLabels.length
        ? `人物围绕${conflictLabels.join("、")}发生对抗，但目标、阻碍与升级过程仍需复核。`
        : "尚未识别出“人物目标—阻碍—冲突升级”的完整因果链。";
  const verified =
    [...emotions, ...conflicts].some(
      (tag) => tag.verification === "verified",
    ) || usable.some((phase) => phase.verification === "verified");
  return { emotion, conflict, needsReview: !verified };
};

function StoryOverview({
  item,
  phases,
}: {
  item: Material;
  phases: StoryPhase[];
}) {
  const data = item.analysisV2!;
  const [reanalysisQueued, setReanalysisQueued] = useState(false);
  const characters =
    data.content.characters
      .map((tag) => tag.label)
      .slice(0, 4)
      .join("、") || "关键人物待确认";
  const conflicts =
    data.content.conflicts
      .map((tag) => tag.label)
      .slice(0, 3)
      .join("、") || "核心冲突待确认";
  const ending =
    phases.at(-1)?.description || data.content.completeness || "故事落点待确认";
  const summary = data.content.summary
    ? copy(data.content.summary)
    : "当前分析尚未形成完整剧情摘要。";
  const detailedStory = phases
    .map((phase) =>
      copy(phase.description || "")
        .trim()
        .replace(/随后[，、：:]?\s*/gu, ""),
    )
    .filter(Boolean)
    .join("；");
  const story = detailedStory || summary;
  const reanalyze = async () => {
    if (
      reanalysisQueued ||
      !window.confirm(
        `确定重新分析“${item.title}”的剧情吗？\n\n将复用已有抽帧、ASR 和 OCR，只刷新剧情理解与分镜文案。`,
      )
    )
      return;
    try {
      await retryInspirationMaterialAnalysis(item.id, true);
      setReanalysisQueued(true);
    } catch (reason) {
      window.alert(
        reason instanceof Error ? reason.message : "重新分析提交失败",
      );
    }
  };
  return (
    <section
      className={`${styles.v2Section} ${styles.storyOverview} ${styles.analysisVerdict}`}
    >
      <div className={styles.sectionHeading}>
        <div>
          <span>全片剧情理解</span>
          <h2>人物为何行动、冲突如何升级、故事停在哪里</h2>
        </div>
        <div className={styles.storySectionActions}>
          <button
            type="button"
            disabled={reanalysisQueued}
            onClick={() => void reanalyze()}
          >
            {reanalysisQueued ? "已进入分析队列" : "重新分析剧情"}
          </button>
          <em>
            {[
              data.creative.hookAssemblyType?.label,
              data.creative.hookSourceStatus?.label,
            ]
              .filter(Boolean)
              .join(" · ") ||
              data.content.completeness ||
              "剧情结构已同步"}
          </em>
        </div>
      </div>
      <div className={styles.storySynopsis}>
        <p>{story}</p>
      </div>
      <div className={styles.storyMeta}>
        <span>
          <b>核心人物：</b>
          {characters}
        </span>
        <span>
          <b>核心冲突：</b>
          {conflicts}
        </span>
        <span>
          <b>当前结局：</b>
          {copy(ending)}
        </span>
      </div>
      {(data.creative.packaging.length > 0 ||
        data.creative.transitions.length > 0 ||
        (data.creative.hook?.sensoryChannels.length ?? 0) > 0) && (
        <div className={styles.creativeDimensions}>
          {data.creative.packaging.length > 0 && (
            <div>
              <b>包装方式</b>
              <TagList tags={data.creative.packaging} />
            </div>
          )}
          {data.creative.transitions.length > 0 && (
            <div>
              <b>转场方式</b>
              <TagList tags={data.creative.transitions} />
            </div>
          )}
          {(data.creative.hook?.sensoryChannels.length ?? 0) > 0 && (
            <div>
              <b>感官通道</b>
              <TagList tags={data.creative.hook?.sensoryChannels ?? []} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HookAnalysisReview({ item }: { item: Material }) {
  const data = item.analysisV2!,
    hook = data.creative.hook;
  const videoRef = useRef<HTMLVideoElement>(null),
    [currentTime, setCurrentTime] = useState(Number(hook?.start) || 0),
    [playing, setPlaying] = useState(false);
  const videoUrl = createInspirationMaterialVideoUrl(item),
    start = Math.max(0, Number(hook?.start) || 0),
    end = Math.max(start, Number(hook?.end) || start);
  const hookLength = Math.max(0, end - start),
    relativeTime = Math.max(0, Math.min(hookLength, currentTime - start));
  const inHook = (evidence: EvidenceItem) =>
    evidence.end >= start && evidence.start <= end;
  const shotCount = data.evidence.filter(
    (evidence) => inHook(evidence) && evidenceGroup(evidence.kind) === "镜头",
  ).length;
  const audioCount = data.evidence.filter(
    (evidence) =>
      inHook(evidence) &&
      (evidenceGroup(evidence.kind) === "音频" ||
        evidenceGroup(evidence.kind) === "对白"),
  ).length;
  const plot =
    copy(hook?.plotSummary || hook?.source || "") ||
    "尚未形成完整的钩子剧情设定。";
  const spoken =
    copy(hook?.spokenSummary || "") ||
    (audioCount
      ? `钩子区间已定位 ${audioCount} 条对白或声音证据，具体声音作用待补充分析。`
      : "钩子区间尚未形成可信的对白或声音结论。");
  const visual =
    copy(hook?.visualSummary || "") ||
    (shotCount
      ? `钩子区间识别到 ${shotCount} 个镜头证据，景别变化与运镜方式待补充分析。`
      : "钩子区间尚未形成可信的画面与运镜结论。");
  const seek = (seconds = start, play = false) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.max(start,Math.min(end,seconds));
    video.currentTime=target;
    setCurrentTime(target);
    if (play && target < end) {
      void video.play().catch(() => undefined);
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < start || video.currentTime >= end)
        video.currentTime = start;
      void video.play().catch(() => undefined);
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };
  useEffect(() => {
    setCurrentTime(start);
    setPlaying(false);
    const video = videoRef.current;
    if (video && video.readyState >= 1) {
      video.pause();
      video.currentTime = start;
    }
  }, [item.id, start, end]);
  if (!hook)
    return (
      <section className={styles.v2Section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>钩子分析层</span>
            <h2>钩子分析与拉片</h2>
          </div>
        </div>
        <InlineEmpty text="当前素材尚未识别出可独立拉片的钩子区间" />
      </section>
    );
  return (
    <section className={`${styles.v2Section} ${styles.hookAnalysisSection}`}>
      <div className={styles.sectionHeading}>
        <div>
          <span>钩子分析层</span>
          <h2>钩子分析与拉片</h2>
        </div>
        <em>{hook.hookType || "钩子类型待确认"}</em>
      </div>
      <p>点击钩子时间戳定位到开场，结合声音、画面、运镜和剧情设定逐项核对。</p>
      <div className={styles.hookAnalysisLayout}>
        <div className={styles.hookAnalysisDetails}>
          <div className={styles.hookIdentity}>
            <button type="button" onClick={() => seek(start)}>
              {duration(start)}–{duration(end)}
            </button>
            <div>
              <span>钩子类型</span>
              <b>{hook.hookType || "待确认"}</b>
            </div>
            <div>
              <span>素材归属</span>
              <b>
                {data.creative.hookAssemblyType?.label ||
                  data.creative.hookSourceStatus?.label ||
                  "待确认"}
              </b>
            </div>
          </div>
          <article>
            <span>剧情设定</span>
            <p>{plot}</p>
          </article>
          <article>
            <span>声音与对白</span>
            <p>{spoken}</p>
          </article>
          <article>
            <span>画面与运镜</span>
            <p>{visual}</p>
          </article>
          {(hook.informationGap || hook.narrativePromise) && (
            <article>
              <span>悬念承诺</span>
              <p>
                {[hook.informationGap, hook.narrativePromise]
                  .filter(Boolean)
                  .map(copy)
                  .join("；")}
              </p>
            </article>
          )}
          {(hook.mechanisms.length > 0 || hook.sensoryChannels.length > 0) && (
            <div className={styles.hookAnalysisTags}>
              {hook.mechanisms.length > 0 && (
                <div>
                  <b>钩子机制</b>
                  <TagList tags={hook.mechanisms} />
                </div>
              )}
              {hook.sensoryChannels.length > 0 && (
                <div>
                  <b>感官通道</b>
                  <TagList tags={hook.sensoryChannels} />
                </div>
              )}
            </div>
          )}
        </div>
        <aside className={styles.hookAnalysisPlayer}>
          <header>
            <div>
              <b>钩子拉片预览</b>
              <span>同一原片的限定钩子区间</span>
            </div>
            <time>
              {duration(relativeTime)}/{duration(hookLength)}
            </time>
          </header>
          {videoUrl ? (
            <>
              <video
                key={`${item.id}-${start}-${end}`}
                ref={videoRef}
                src={`${videoUrl}#t=${start},${end}`}
                preload="metadata"
                playsInline
                onLoadedMetadata={() => seek(start)}
                onClick={togglePlayback}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                onTimeUpdate={(event) => {
                  const video = event.currentTarget,
                    time = video.currentTime;
                  if (time < start) {
                    video.currentTime = start;
                    setCurrentTime(start);
                    return;
                  }
                  if (end > start && time>=end) {
                    video.pause();
                    video.currentTime = end;
                    setCurrentTime(end);
                    setPlaying(false);
                    return;
                  }
                  setCurrentTime(time);
                }}
              />
              <div className={styles.hookRangeControls}>
                <button type="button" onClick={togglePlayback}>
                  {playing ? "❚❚ 暂停" : "▶ 播放钩子"}
                </button>
                <input
                  aria-label="钩子区间进度"
                  type="range"
                  min="0"
                  max={Math.max(0.01, hookLength)}
                  step="0.05"
                  value={relativeTime}
                  onChange={(event) => seek(start + Number(event.target.value))}
                />
                <time>
                  {duration(relativeTime)}/{duration(hookLength)}
                </time>
              </div>
              <button type="button" onClick={() => seek(start, true)}>
                ↺ 从钩子起点播放
              </button>
            </>
          ) : (
            <InlineEmpty text="当前素材没有可播放片源" />
          )}
        </aside>
      </div>
    </section>
  );
}

function Analysis({
  item,
  all,
  onSelect,
  onFactory,
}: {
  item: Material;
  all: Material[];
  onSelect: (id: string) => void;
  onFactory: () => void;
}) {
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const [reviewTime, setReviewTime] = useState(0);
  const data = item.analysisV2;
  if (!data)
    return (
      <State
        title="正在读取 material-v2 分析详情"
        detail="分析已经完成，正在加载四层标签与证据；如果接口异常，页面会显示可重试的错误信息。"
      />
    );
  const reviewVideoUrl = createInspirationMaterialVideoUrl(item);
  const seekReviewVideo = (seconds: number) => {
    const video = reviewVideoRef.current;
    if (!video) return;
    const target = Math.max(0, Number(seconds) || 0);
    video.currentTime = target;
    video.pause();
    setReviewTime(target);
  };
  const contentGroups: [string, [string, MaterialTag[]][]][] = [
    [
      "故事定位",
      [
        ["题材", data.content.genres],
        ["主题", data.content.themes],
      ],
    ],
    [
      "人物关系",
      [
        ["人物", data.content.characters],
        ["关系", data.content.relations],
      ],
    ],
    [
      "戏剧动力",
      [
        ["情绪", data.content.emotions],
        ["冲突", data.content.conflicts],
      ],
    ],
    [
      "叙事元素",
      [
        ["情节点", data.content.storyBeats],
        ["场景", data.content.scenes],
      ],
    ],
  ];
  const storyboardPhases = data.creative.timeline,
    storyReviewPhases = data.content.storyboardUnits.length
      ? data.content.storyboardUnits
      : storyboardPhases,
    phases = storyboardPhases.slice(0, 7);
  const dramaticDrivers = concreteDramaticDrivers(
    phases,
    data.content.emotions,
    data.content.conflicts,
  );
  const hook = data.creative.hook,
    hookStart = Number(hook?.start),
    hookEnd = Number(hook?.end);
  const hookPhaseIndex =
    Number.isFinite(hookStart) &&
    Number.isFinite(hookEnd) &&
    hookEnd > hookStart
      ? phases.reduce(
          (best, phase, index) => {
            const overlap = Math.max(
              0,
              Math.min(phase.end, hookEnd) - Math.max(phase.start, hookStart),
            );
            return overlap > best.overlap ? { index, overlap } : best;
          },
          { index: -1, overlap: 0 },
        ).index
      : -1;
  const dimensionCount = contentGroups
    .flatMap(([, dimensions]) => dimensions)
    .filter(
      ([label, tags]) =>
        tags.length ||
        ((label === "情绪" || label === "冲突") && phases.length > 0),
    ).length;
  const storyCoverage =
    phases.length >= 4
      ? `${phases.length} 个因果阶段`
      : `仅识别 ${phases.length} 个阶段 · 全片结构待补足`;
  return (
    <div className={styles.analysisV2}>
      <div className={styles.instancePicker}>
        <label>
          分析实例
          <select value={item.id} onChange={(e) => onSelect(e.target.value)}>
            {all.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </label>
        <span>
          契约 <b>material-v2</b>
        </span>
        <button className={styles.primary} onClick={onFactory}>
          进入内容工厂 →
        </button>
      </div>
      <StoryOverview item={item} phases={storyboardPhases} />
      <HookAnalysisReview item={item} />
      <section className={styles.v2Section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>剧情拉片层</span>
            <h2>按剧情节点核对原片</h2>
          </div>
          <em>{storyReviewPhases.length} 个剧情节点</em>
        </div>
        <p>
          点击左侧剧情时间码，右侧播放器会定位到对应画面；可继续拖动进度条逐段拉片。
        </p>
        <div className={styles.factReviewLayout}>
          <div className={styles.factReviewLedgers}>
            {storyReviewPhases.length ? (
              <div
                className={`${styles.storyBeatLedger} ${styles.storyReviewLedger}`}
              >
                <header>
                  <div>
                    <b>分段剧情时间线</b>
                    <span>人物行动 · 冲突推进 · 直接结果</span>
                  </div>
                </header>
                {storyReviewPhases.map((phase, index) => (
                  <article key={`${phase.code}-${index}`}>
                    <i>{index + 1}</i>
                    <button
                      type="button"
                      className={styles.factTimecode}
                      onClick={() => seekReviewVideo(phase.start)}
                      aria-label={`定位到${duration(phase.start)}`}
                    >
                      {duration(phase.start)}–{duration(phase.end)}
                    </button>
                    <div>
                      <b>{phase.label}</b>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <InlineEmpty text="事件账本尚未形成可拉片的剧情时间线，请重新分析剧情" />
            )}
          </div>
          <aside className={styles.factReviewPlayer}>
            <header>
              <div>
                <b>拉片预览</b>
                <span>点击左侧剧情时间码定位</span>
              </div>
              <time>{duration(reviewTime)}</time>
            </header>
            {reviewVideoUrl ? (
              <video
                ref={reviewVideoRef}
                src={reviewVideoUrl}
                controls
                preload="metadata"
                playsInline
                onTimeUpdate={(event) =>
                  setReviewTime(event.currentTarget.currentTime)
                }
              />
            ) : (
              <InlineEmpty text="当前素材没有可播放片源" />
            )}
          </aside>
        </div>
      </section>
      <section className={styles.v2Section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>内容标签层</span>
            <h2>素材内容理解</h2>
          </div>
          <em>{dimensionCount}/8 个维度有结论</em>
        </div>
        <p>
          按“故事定位 → 人物关系 → 戏剧动力 →
          叙事元素”组织；识别质量、语种和技术分段不会作为故事标签展示。
        </p>
        <div className={styles.contentLogic}>
          {contentGroups.map(([group, dimensions]) => (
            <article key={group}>
              <h3>{group}</h3>
              {group === "戏剧动力" ? (
                <div className={styles.dramaticDrivers}>
                  <div>
                    <b>情绪动力</b>
                    <p>{dramaticDrivers.emotion}</p>
                  </div>
                  <div>
                    <b>冲突动力</b>
                    <p>{dramaticDrivers.conflict}</p>
                  </div>
                  {dramaticDrivers.needsReview && (
                    <small>依据当前剧情节点自动归纳 · 待复核</small>
                  )}
                </div>
              ) : (
                dimensions.map(([label, tags]) => (
                  <div key={label}>
                    <b>{label}</b>
                    <TagList tags={tags} />
                  </div>
                ))
              )}
            </article>
          ))}
        </div>
        {phases.length > 0 && (
          <div className={styles.storyBeatLedger}>
            <header>
              <div>
                <b>全片因果情节点</b>
                <span>人物目标 → 具体事件 → 结果/关系变化</span>
              </div>
              <em
                className={
                  phases.length >= 4
                    ? styles.coverageReady
                    : styles.coverageReview
                }
              >
                {storyCoverage}
              </em>
            </header>
            {phases.map((phase, index) => (
              <article
                className={index === hookPhaseIndex ? styles.hookBeat : ""}
                key={`${phase.code}-${index}`}
              >
                <i>{index + 1}</i>
                <time>
                  {duration(phase.start)}–{duration(phase.end)}
                </time>
                <div>
                  <b>
                    {phase.label}
                    {index === hookPhaseIndex && (
                      <span className={styles.hookBadge}>钩子</span>
                    )}
                  </b>
                  <p>
                    {phase.description ||
                      "该节点缺少具体事件与结果，需要重新分析或人工复核。"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
        {!contentGroups.some(([, dimensions]) =>
          dimensions.some(([, tags]) => tags.length),
        ) &&
          !phases.length && (
            <InlineEmpty text="没有可信的故事结论，请退回重分析" />
          )}
      </section>
      {(data.value.scores.length > 0 ||
        data.value.inspirations.length > 0 ||
        data.value.avoid.length > 0) && (
        <section className={styles.v2Section}>
          <h2>灵感与复用价值</h2>
          {data.value.scores.length > 0 && (
            <div className={styles.scoreGrid}>
              {data.value.scores.map((v) => (
                <article key={v.code}>
                  <span>{v.label}</span>
                  <strong>{Math.round(v.score)}</strong>
                  <i>
                    <em
                      style={{
                        width: `${Math.max(0, Math.min(100, v.score))}%`,
                      }}
                    />
                  </i>
                  <small>{v.reason || "无评分说明"}</small>
                </article>
              ))}
            </div>
          )}
          <div className={styles.adviceGrid}>
            {data.value.inspirations.length > 0 && (
              <Advice title="值得借鉴" items={data.value.inspirations} />
            )}{" "}
            {data.value.avoid.length > 0 && (
              <Advice title="不建议复制" items={data.value.avoid} />
            )}{" "}
            {data.value.suitableGenres.length > 0 && (
              <Advice title="适合题材" items={data.value.suitableGenres} />
            )}{" "}
            {data.value.suitableAudiences.length > 0 && (
              <Advice title="适合受众" items={data.value.suitableAudiences} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function HookReview({
  hooks,
  selectedId,
  onSelect,
  onSaved,
  flash,
}: {
  hooks: HookAsset[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSaved: () => void;
  flash: (message: string) => void;
}) {
  const selected = hooks.find((hook) => hook.id === selectedId) ?? hooks[0];
  const [localHook, setLocalHook] = useState(selected),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false),
    [reviewStart, setReviewStart] = useState(selected?.start ?? 0),
    [reviewEnd, setReviewEnd] = useState(selected?.end ?? 0);
  useEffect(() => {
    if (!selected) return;
    setLocalHook(selected);
    setReviewStart(selected.start);
    setReviewEnd(selected.end);
    setNote("");
  }, [selected?.id, selected?.boundaryStatus, selected?.reviewStatus]);
  if (!localHook)
    return (
      <State
        title="钩子不存在"
        detail="该钩子可能已被删除，请返回钩子原型页重新选择。"
      />
    );
  const submit = async (status: "approved" | "rejected") => {
    setSaving(true);
    try {
      const updated = await reviewHookBoundary(
        localHook.id,
        status,
        note,
        status === "approved"
          ? { start: reviewStart, end: reviewEnd }
          : undefined,
      );
      setLocalHook(updated);
      setReviewStart(updated.start);
      setReviewEnd(updated.end);
      setNote("");
      flash(
        status === "approved"
          ? "钩子边界已通过并持久保存"
          : "钩子已驳回并持久保存",
      );
      onSaved();
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "钩子复核保存失败");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={`${styles.reviewV2} ${styles.hookReviewWorkspace}`}>
      <aside>
        <div className={styles.reviewScope}>
          <b>钩子人工复核</b>
          <small>所有工作区成员均可操作</small>
        </div>
        {hooks.map((hook) => (
          <button
            className={hook.id === localHook.id ? styles.selected : ""}
            key={hook.id}
            onClick={() => onSelect(hook.id)}
          >
            <b>{hook.title}</b>
            <small>
              {hook.boundaryStatus === "verified" &&
              hook.reviewStatus === "approved"
                ? "已通过"
                : "待复核"}{" "}
              · {duration(hook.start)}–{duration(hook.end)}
            </small>
          </button>
        ))}
      </aside>
      <section>
        <div className={styles.hookReviewHeading}>
          <div>
            <span>钩子原型 / 人工复核</span>
            <h2>{localHook.title}</h2>
            <p>
              {localHook.materialTitle || "来源待补充"} · 当前区间{" "}
              {duration(localHook.start)}–{duration(localHook.end)}
            </p>
          </div>
          <em
            className={
              localHook.boundaryStatus === "verified"
                ? styles.hookVerified
                : styles.hookNeedsReview
            }
          >
            {localHook.boundaryStatus === "verified" &&
            localHook.reviewStatus === "approved"
              ? "复核已通过"
              : localHook.reviewStatus === "rejected"
                ? "已驳回"
                : "等待复核"}
          </em>
        </div>
        {localHook.materialVideoUrl ? (
          <video
            className={styles.hookReviewVideo}
            src={`${localHook.materialVideoUrl}#t=${reviewStart},${reviewEnd}`}
            controls
            preload="metadata"
            playsInline
          />
        ) : (
          <InlineEmpty text="当前钩子没有可播放片源，请按证据与时间码复核" />
        )}
        <div className={styles.hookReviewEvidence}>
          <article>
            <span>对白边界</span>
            <b>
              {localHook.safeStart?.dialogueStatus || "未验证"} →{" "}
              {localHook.safeEnd?.dialogueStatus || "未验证"}
            </b>
          </article>
          <article>
            <span>动作边界</span>
            <b>
              {localHook.safeStart?.actionStatus || "未验证"} →{" "}
              {localHook.safeEnd?.actionStatus || "未验证"}
            </b>
          </article>
          <article>
            <span>镜头边界</span>
            <b>
              {localHook.safeStart?.shotStatus || "未验证"} →{" "}
              {localHook.safeEnd?.shotStatus || "未验证"}
            </b>
          </article>
        </div>
        <div className={styles.hookReviewRange}>
          <label>
            起点（秒）
            <input
              aria-label="钩子复核起点"
              type="number"
              min="0"
              step="0.01"
              value={reviewStart}
              onChange={(event) => setReviewStart(Number(event.target.value))}
            />
          </label>
          <label>
            终点（秒）
            <input
              aria-label="钩子复核终点"
              type="number"
              min="0"
              step="0.01"
              value={reviewEnd}
              onChange={(event) => setReviewEnd(Number(event.target.value))}
            />
          </label>
          <span>
            区间长度 {formatDurationZh(Math.max(0, reviewEnd - reviewStart), 2)}
            （允许 0分5秒–1分0秒）
          </span>
        </div>
        <label className={styles.reviewNote}>
          复核依据（选填）
          <textarea
            className="resize-none"
            style={{ resize: "none" }}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="可选：说明对白、动作、镜头是否完整，以及调整边界的依据"
          />
        </label>
        <div className={styles.reviewActions}>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit("rejected")}
          >
            驳回钩子
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={
              saving ||
              reviewStart < 0 ||
              reviewEnd <= reviewStart ||
              reviewEnd - reviewStart < 5 ||
              reviewEnd - reviewStart > 60
            }
            onClick={() => void submit("approved")}
          >
            {saving ? "保存中…" : "确认边界并通过"}
          </button>
        </div>
      </section>
    </div>
  );
}

function MaterialLibraryPanel({
  kind,
  assets,
  flash,
  onDeleted,
}: {
  kind: "ai_preface" | "narration";
  assets: MaterialLibraryAsset[];
  flash: (message: string) => void;
  onDeleted: () => void;
}) {
  const [query, setQuery] = useState(""),
    [fission, setFission] = useState<MaterialLibraryAsset | null>(null),
    [preview, setPreview] = useState<MaterialLibraryAsset | null>(null),
    [deleteTarget, setDeleteTarget] = useState<MaterialLibraryAsset | null>(
      null,
    ),
    [editing, setEditing] = useState<MaterialLibraryAsset | null>(null),
    [editTitle, setEditTitle] = useState(""),
    [deleting, setDeleting] = useState(false),
    [savingTitle, setSavingTitle] = useState(false);
  const filtered = assets.filter((asset) =>
    `${asset.title} ${asset.sourceTitle || ""} ${asset.platform || ""} ${asset.genres.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const playbackUrl = (asset: MaterialLibraryAsset) =>
    asset.mediaUrl ||
    (asset.sourceMediaUrl
      ? `${asset.sourceMediaUrl}#t=${Math.max(0, asset.clipStart)},${Math.max(asset.clipStart, asset.clipEnd)}`
      : "");
  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeMaterialLibraryAsset(deleteTarget.id);
      setDeleteTarget(null);
      flash("前贴素材已删除");
      onDeleted();
    } catch (error) {
      flash(error instanceof Error ? error.message : "素材删除失败");
    } finally {
      setDeleting(false);
    }
  };
  const saveTitle = async () => {
    if (!editing || !editTitle.trim()) return;
    setSavingTitle(true);
    try {
      await renameMaterialLibraryAsset(editing.id, editTitle);
      setEditing(null);
      flash("前贴名称已保存");
      onDeleted();
    } catch (error) {
      flash(error instanceof Error ? error.message : "名称保存失败");
    } finally {
      setSavingTitle(false);
    }
  };
  return (
    <section className={styles.libraryPanel}>
      <div className={styles.libraryHeading}>
        <div>
          <span className={styles.eyebrow}>
            {kind === "ai_preface" ? "AI PREFACE LIBRARY" : "NARRATION LIBRARY"}
          </span>
          <h2>{kind === "ai_preface" ? "AI 前贴库" : "解说库"}</h2>
          <p>
            {kind === "ai_preface"
              ? "独立切片、来源可追溯；可复用提示词并生成五组裂变方案。"
              : "保存解说素材的原片引用、文案与投放指标。"}
          </p>
        </div>
        <label className={styles.librarySearch}>
          <span className="sr-only">搜索素材库</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索资产、来源、平台或题材"
          />
          {query && (
            <button
              type="button"
              aria-label="清空素材库搜索"
              onClick={() => setQuery("")}
            >
              ×
            </button>
          )}
        </label>
      </div>
      {filtered.length ? (
        <div className={styles.libraryGrid}>
          {filtered.map((asset) => {
            const url = playbackUrl(asset);
            return (
              <article className={styles.libraryCard} key={asset.id}>
                <button
                  type="button"
                  className={styles.libraryPreview}
                  onClick={() => url && setPreview(asset)}
                  aria-label={`播放${asset.title}`}
                >
                  {url ? (
                    <video src={url} muted playsInline preload="metadata" />
                  ) : (
                    <span>暂无片源</span>
                  )}
                  <span>
                    {asset.kind === "ai_preface" ? "AI 前贴" : "解说"} ·{" "}
                    {asset.sourceTitle || "来源待补充"}
                  </span>
                </button>
                <div className={styles.libraryCardBody}>
                  <h3>{asset.title}</h3>
                  <div className={styles.tags}>
                    {asset.genres.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    <span>{asset.audienceType || "受众待定"}</span>
                    <span>{asset.language || "语种待定"}</span>
                  </div>
                  <div className={styles.metricStrip}>
                    <span>
                      <small>ADX 消耗</small>
                      <b>
                        {asset.adxMetrics.spend == null
                          ? "—"
                          : `${asset.adxMetrics.currency || ""} ${asset.adxMetrics.spend.toLocaleString()}`}
                      </b>
                    </span>
                    <span>
                      <small>曝光</small>
                      <b>
                        {asset.adxMetrics.impressions == null
                          ? "—"
                          : asset.adxMetrics.impressions.toLocaleString()}
                      </b>
                    </span>
                    <span>
                      <small>平台</small>
                      <b>{asset.platform || "—"}</b>
                    </span>
                  </div>
                  <p className={styles.libraryReason}>
                    {asset.adxMetrics.spend != null
                      ? "爆款机制与真实指标已关联"
                      : "创意机制分析（没有完整 ADX 指标，不推断爆款表现）"}
                  </p>
                  <div className={styles.cardButtons}>
                    {url && (
                      <>
                        <button type="button" onClick={() => setPreview(asset)}>
                          预览
                        </button>
                        <a href={url} download={asset.title}>
                          下载
                        </a>
                      </>
                    )}
                    {kind === "ai_preface" && (
                      <button
                        className={styles.primary}
                        type="button"
                        onClick={() => setFission(asset)}
                      >
                        提示词裂变
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => setDeleteTarget(asset)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <State
          title={
            assets.length
              ? "当前筛选无结果"
              : `暂无${kind === "ai_preface" ? "AI 前贴" : "解说"}资产`
          }
          detail={
            assets.length
              ? "请清空搜索后重试"
              : "完成素材自动分析后会自动进入这里。"
          }
        />
      )}{" "}
      {fission && (
        <PromptFissionModal
          asset={fission}
          onClose={() => setFission(null)}
          flash={flash}
        />
      )}{" "}
      {preview && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreview(null);
          }}
        >
          <section className={styles.videoPreviewModal}>
            <header>
              <b>{preview.title}</b>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="关闭预览"
              >
                ×
              </button>
            </header>
            {playbackUrl(preview) ? (
              <video src={playbackUrl(preview)} controls autoPlay playsInline />
            ) : (
              <p>素材加载失败，请检查文件是否仍然存在。</p>
            )}
          </section>
        </div>
      )}{" "}
      {deleteTarget && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <section className={styles.deleteModal}>
            <h3>删除前贴素材？</h3>
            <p>将从前贴库移除“{deleteTarget.title}”，此操作不可撤销。</p>
            <footer>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void remove()}
                disabled={deleting}
              >
                {deleting ? "删除中…" : "确认删除"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function PromptFissionModal({
  asset,
  onClose,
  flash,
}: {
  asset: MaterialLibraryAsset;
  onClose: () => void;
  flash: (message: string) => void;
}) {
  const mechanisms = asset.hitReasons
    .map((reason) => String(reason.reason || ""))
    .filter(Boolean);
  const [locked, setLocked] = useState<string[]>(
      mechanisms.length ? mechanisms : ["强冲突", "信息差"],
    ),
    [dimensions, setDimensions] = useState<string[]>(["人物", "场景", "题材"]),
    [busy, setBusy] = useState(false),
    [plan, setPlan] = useState<PromptFissionPlan | null>(null);
  const options = ["人物", "场景", "题材", "冲突", "视觉风格", "对白语气"];
  const run = async () => {
    setBusy(true);
    try {
      setPlan(await createPromptFission(asset.id, locked, dimensions));
      flash("已生成五组提示词裂变方案");
    } catch (error) {
      flash(error instanceof Error ? error.message : "提示词裂变失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="提示词裂变"
    >
      <section className={styles.fissionModal}>
        <header>
          <div>
            <span className={styles.eyebrow}>PROMPT FISSION</span>
            <h2>{asset.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭提示词裂变">
            ×
          </button>
        </header>
        <p>
          只生成提示词和分镜方案，不直接生成视频；锁定机制会在结果校验中逐组保留。
        </p>
        <fieldset>
          <legend>锁定机制</legend>
          {locked.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                checked
                onChange={() =>
                  setLocked((current) =>
                    current.filter((item) => item !== value),
                  )
                }
              />
              {value}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>裂变维度</legend>
          {options.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={dimensions.includes(value)}
                onChange={() =>
                  setDimensions((current) =>
                    current.includes(value)
                      ? current.filter((item) => item !== value)
                      : [...current, value],
                  )
                }
              />
              {value}
            </label>
          ))}
        </fieldset>
        {plan ? (
          <div className={styles.fissionResults}>
            <b>已生成 {plan.variants.length} 组方案</b>
            {plan.variants.map((variant, index) => (
              <article key={index}>
                <h3>{variant.title}</h3>
                <p>{variant.prompt}</p>
                <ol>
                  {variant.storyboard.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ol>
                <small>
                  保留：{variant.preservedMechanisms.join("、")} · 变化：
                  {variant.changedContent.join("、")}
                </small>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(variant.prompt)
                  }
                >
                  复制提示词
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.fissionActions}>
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button
              className={styles.primary}
              disabled={busy || !locked.length || !dimensions.length}
              onClick={() => void run()}
            >
              {busy ? "正在生成并校验…" : "生成五组方案"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

const claimLabel = (claim?: MaterialTag) => claim?.label || "证据不足";

function suggestedTypeDecision(item: Material): {
  hasPreface: MaterialTypeReviewDecision;
  hasNarration: MaterialTypeReviewDecision;
} {
  const creative = item.analysisV2?.creative;
  const assembly = claimLabel(creative?.hookAssemblyType);
  const sourceStatus = claimLabel(creative?.hookSourceStatus);
  const hasPreface = ["同剧外搭", "跨剧外搭", "外搭来源待确认"].includes(assembly) || ["疑似外搭", "已确认外搭", "已确认同剧"].includes(sourceStatus)
    ? "yes"
    : assembly === "无前置钩子" || sourceStatus === "无独立钩子"
      ? "no"
      : "uncertain";
  const narration = creative?.narrationSegments || [];
  const verifiedNarration = narration.some((segment) => segment.verification === "verified");
  const bodyFormat = claimLabel(creative?.bodyFormat);
  const hasNarration = verifiedNarration || bodyFormat === "解说主导"
    ? "yes"
    : creative?.narrationCoverage === 0 && bodyFormat === "正片主导"
      ? "no"
      : "uncertain";
  return { hasPreface, hasNarration };
}

function TypeReview({
  items,
  onSaved,
  flash,
}: {
  items: Material[];
  onSaved: () => void;
  flash: (s: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id || "");
  const item = items.find((value) => value.id === selectedId) || items[0];
  return (
    <div className={styles.typeReviewWorkspace}>
      <aside className={styles.typeReviewQueue} aria-label="待分流素材">
        <div className={styles.typeReviewQueueHeader}>
          <b>待分流队列</b>
          <small>优先核对类型冲突和高曝光素材</small>
        </div>
        {items.map((value) => {
          const contradiction = value.type === "原剧拼接" && suggestedTypeDecision(value).hasPreface === "yes";
          return (
            <button type="button" className={value.id === item.id ? styles.selected : ""} key={value.id} onClick={() => setSelectedId(value.id)}>
              <b>{value.title}</b>
              <span>{contradiction ? "模型结论冲突" : value.type === "未判定" ? "类型待核对" : `模型建议：${value.type}`}</span>
              <small>{value.adxMetrics.impressions || value.exposure ? `曝光 ${new Intl.NumberFormat("zh-CN").format(value.adxMetrics.impressions || value.exposure)}` : value.language || "语种待确认"}</small>
            </button>
          );
        })}
      </aside>
      <TypeReviewDecision key={item.id} item={item} onSaved={onSaved} flash={flash} />
    </div>
  );
}

function TypeReviewDecision({
  item,
  onSaved,
  flash,
}: {
  item: Material;
  onSaved: () => void;
  flash: (s: string) => void;
}) {
  const suggested = suggestedTypeDecision(item);
  const [hasPreface, setHasPreface] = useState<MaterialTypeReviewDecision>(suggested.hasPreface);
  const [hasNarration, setHasNarration] = useState<MaterialTypeReviewDecision>(suggested.hasNarration);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const creative = item.analysisV2?.creative;
  const hook = creative?.hook;
  const narrationSegments = (creative?.narrationSegments || []).filter((segment) => segment.text);
  const outcome = hasPreface === "uncertain" || hasNarration === "uncertain"
    ? { label: "仍为类型待核对", libraries: "不会进入专属素材库" }
    : hasPreface === "yes" && hasNarration === "yes"
      ? { label: "AI 前贴 + 解说", libraries: "进入 AI 前贴库和解说库" }
      : hasPreface === "yes"
        ? { label: "AI 前贴", libraries: "进入 AI 前贴库" }
        : hasNarration === "yes"
          ? { label: "解说", libraries: "进入解说库" }
          : { label: "原剧拼接", libraries: "仅保留在跑量素材" };
  const save = async (action: "confirm" | "insufficient") => {
    if (saving) return;
    if (action === "confirm" && (hasPreface === "uncertain" || hasNarration === "uncertain")) {
      setError("必须分别确认是否存在独立前贴和独立解说；无法确认时请标记证据不足。");
      return;
    }
    if (action === "insufficient" && !note.trim()) {
      setError("标记证据不足时，请填写需要补充或重新分析的具体证据。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await submitInspirationTypeReview(item.id, { hasPreface, hasNarration, note, action });
      flash(action === "confirm" ? `已确认归类：${saved.materialType}${saved.libraryKinds.length === 2 ? "，并同步两个素材库" : ""}` : "已保留为类型待核对");
      onSaved();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "类型复核保存失败";
      setError(message);
      flash(message);
    } finally {
      setSaving(false);
    }
  };
  const reanalyze = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await retryInspirationMaterialAnalysis(
        item.id,
        true,
        true,
        note.trim() || "类型证据不足，请重新识别前贴边界与独立解说口播",
      );
      flash("已退回并重新加入分析队列");
      onSaved();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "退回重分析失败";
      setError(message);
      flash(message);
    } finally {
      setSaving(false);
    }
  };
  const renderDecision = (
    name: string,
    value: MaterialTypeReviewDecision,
    setValue: (next: MaterialTypeReviewDecision) => void,
  ) => (
    <fieldset className={styles.typeDecisionGroup} disabled={saving}>
      <legend>{name}</legend>
      <div>
        {(["yes", "no", "uncertain"] as const).map((option) => (
          <label key={option}>
            <input type="radio" name={`${item.id}-${name}`} value={option} checked={value === option} onChange={() => setValue(option)} />
            <span>{option === "yes" ? "有" : option === "no" ? "没有" : "证据不足"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <>
      <section className={styles.typeEvidencePanel}>
        <header>
          <div>
            <h2>{item.title}</h2>
            <p>模型建议：{item.type} · 置信度 {item.classificationConfidence ? `${pct(item.classificationConfidence)}%` : "未提供"}</p>
          </div>
          <span>{item.language || "语种待确认"}</span>
        </header>
        <div className={styles.typeEvidenceVideo}>
          {item.media?.url ? <video src={`${item.media.url}#t=0,20`} controls playsInline /> : <InlineEmpty text="暂无可播放视频，请根据时间证据或退回重分析" />}
        </div>
        <div className={styles.typeEvidenceCards}>
          <article>
            <b>独立前贴证据</b>
            <strong>{claimLabel(creative?.hookAssemblyType)}</strong>
            <p>{hook ? `${duration(hook.start)}–${duration(hook.end)} · ${hook.visualSummary || hook.plotSummary || hook.source || "检测到开头钩子区间"}` : claimLabel(creative?.hookSourceStatus)}</p>
          </article>
          <article>
            <b>独立解说证据</b>
            <strong>{narrationSegments.length ? `${narrationSegments.length} 段候选口播` : "未提取到已验证口播"}</strong>
            <p>{narrationSegments.slice(0, 2).map((segment) => `${duration(segment.start)}–${duration(segment.end)} “${segment.text}”`).join("；") || `正片形态：${claimLabel(creative?.bodyFormat)}`}</p>
          </article>
          <article>
            <b>模型分类依据</b>
            <strong>{item.classificationReasons[0]?.reason || "依据待补充"}</strong>
            <p>{item.classificationReasons.slice(1, 3).map((value) => value.reason).join("；") || "请结合开头画面和口播声画关系人工判断。"}</p>
          </article>
        </div>
      </section>
      <section className={styles.typeDecisionPanel}>
        <header>
          <h2>完成类型分流</h2>
          <p>只判断可见、可听证据；系统根据两个答案自动推导归类。</p>
        </header>
        {renderDecision("是否存在独立制作的前贴？", hasPreface, setHasPreface)}
        {renderDecision("是否存在独立解说口播？", hasNarration, setHasNarration)}
        <div className={styles.typeOutcome} aria-live="polite">
          <small>确认后归类</small>
          <strong>{outcome.label}</strong>
          <span>{outcome.libraries}</span>
        </div>
        <label className={styles.reviewNote}>
          复核说明
          <textarea className="resize-none" style={{ resize: "none" }} value={note} onChange={(event) => setNote(event.target.value)} placeholder="可填写判断依据；证据不足时必填" />
        </label>
        {error && <p className={styles.typeReviewError} role="alert">{error}</p>}
        <div className={styles.typeReviewActions}>
          <button type="button" disabled={saving} onClick={() => void reanalyze()}>退回重分析</button>
          <button type="button" disabled={saving} onClick={() => void save("insufficient")}>证据不足，暂不归类</button>
          <button type="button" className={styles.primary} disabled={saving || hasPreface === "uncertain" || hasNarration === "uncertain"} aria-busy={saving} onClick={() => void save("confirm")}>{saving ? "正在保存…" : "确认归类并同步素材库"}</button>
        </div>
      </section>
    </>
  );
}

function Review({
  items,
  onSaved,
  flash,
}: {
  items: Material[];
  onSaved: () => void;
  flash: (s: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? ""),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false);
  const item = items.find((v) => v.id === selectedId) ?? items[0];
  const uncertain = (item.analysisV2?.review.items ?? []).filter((value) => !isClassificationReviewField(`${value.field} ${value.label}`));
  for (const group of Object.values(item.analysisV2?.content ?? {})) {
    if (Array.isArray(group))
      for (const tag of group as MaterialTag[])
        if (
          tag.verification === "needs_review" &&
          !uncertain.some((v) => v.id === tag.code)
        )
          uncertain.push({
            id: tag.code,
            field: "content",
            label: tag.label,
            reason: "模型标记为待复核",
            confidence: tag.confidence,
          });
  }
  const submit = async (status: "已通过" | "已修改" | "退回重分析") => {
    setSaving(true);
    try {
      await submitInspirationReview(item.id, status, note);
      flash(
        status === "退回重分析" ? "已退回并重新入队" : "复核结果已持久保存",
      );
      onSaved();
    } catch (reason) {
      flash(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={styles.reviewV2}>
      <aside>
        {items.map((v) => (
          <button
            className={v.id === item.id ? styles.selected : ""}
            key={v.id}
            onClick={() => setSelectedId(v.id)}
          >
            <b>{v.title}</b>
            <small>{v.analysisV2?.review.items.length ?? 0} 个待确认项</small>
          </button>
        ))}
      </aside>
      <section>
        <h2>人工复核</h2>
        <p>只复核证据不足、不确定或冲突的标签。</p>
        {uncertain.length ? (
          <div className={styles.reviewItems}>
            {uncertain.map((v) => (
              <article key={v.id}>
                <b>{v.label}</b>
                <span>{v.reason || v.field}</span>
                {typeof v.confidence === "number" &&
                  Number.isFinite(v.confidence) && (
                    <small>置信度 {pct(v.confidence)}%</small>
                  )}
                {v.proposedValue && <em>建议：{v.proposedValue}</em>}
              </article>
            ))}
          </div>
        ) : (
          <InlineEmpty text="模型未列出具体待复核标签，可直接确认整体结果" />
        )}
        <label className={styles.reviewNote}>
          复核说明
          <textarea
            className="resize-none"
            style={{ resize: "none" }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="记录修改依据或退回原因"
          />
        </label>
        <div className={styles.reviewActions}>
          <button disabled={saving} onClick={() => void submit("退回重分析")}>
            退回重分析
          </button>
          <button disabled={saving} onClick={() => void submit("已修改")}>
            修改后通过
          </button>
          <button
            className={styles.primary}
            disabled={saving}
            onClick={() => void submit("已通过")}
          >
            确认通过
          </button>
        </div>
      </section>
    </div>
  );
}

function Upload({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (item: Material) => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [remoteUrls, setRemoteUrls] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [progress, setProgress] = useState(0),
    [stage, setStage] = useState("");
  const isImage = files.length > 0 && files.every((item) => item.type.startsWith("image/"));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const normalizedRemoteUrls = [...new Set(remoteUrls.split(/\r?\n|[,，]/).map((value) => value.trim()).filter(Boolean))];
    if (!files.length && !normalizedRemoteUrls.length) {
      setError("请选择素材文件，或输入至少一个视频链接");
      return;
    }
    if (files.some((item) => item.size === 0)) {
      setError("素材文件为空，请重新选择");
      return;
    }
    setSaving(true);
    setError("");
    setProgress(0);
    try {
      const form = new FormData(formElement);
      setStage("正在校验并查重");
      const sourceUrl = String(form.get("sourceUrl") || "").trim();
      if (sourceUrl) {
        try {
          new URL(sourceUrl);
        } catch {
          throw new Error("原始素材链接格式不正确");
        }
      }
      const exposure = Math.max(0, Number(form.get("exposure") || 0)),
        days = Math.max(0, Number(form.get("days") || 0));
      const failures: string[] = [];
      let savedCount = 0;
      for (const [index, currentFile] of files.entries()) {
        try {
          setStage(`正在处理第 ${index + 1}/${files.length} 个文件`);
          const [videoDuration, contentHash] = await Promise.all([
            readVideoDuration(currentFile),
            hashInspirationVideo(currentFile),
          ]);
          const duplicate = await findInspirationMaterialByHash(contentHash);
          if (duplicate) {
            failures.push(`${currentFile.name}：已入库（${duplicate.title}）`);
            continue;
          }
          const input = {
            title: String(form.get("title") || currentFile.name.replace(/\.[^.]+$/, "")),
            type: (currentFile.type.startsWith("image/")
              ? "海报图片"
              : String(form.get("type") || "未判定")) as InspirationMaterialType,
            source: "外部" as const,
            platform: String(form.get("platform") || "手动上传"),
            market: String(form.get("market") || "未知市场"),
            language: String(form.get("language") || "未知语种"),
            theme: String(form.get("theme") || "待分析"),
            exposure,
            days,
            duration: videoDuration,
            contentHash,
            sourceUrl,
            rightsStatus: String(form.get("rightsStatus") || "仅限内部分析"),
            adxMetrics: {
              spend: Number(form.get("spend")) || undefined,
              impressions: exposure || undefined,
              clicks: Number(form.get("clicks")) || undefined,
              ctr: Number(form.get("ctr")) || undefined,
              days: days || undefined,
              currency: String(form.get("currency") || "") || undefined,
              updatedAt: new Date().toISOString(),
            },
          };
          const item = await saveInspirationMaterial(input, currentFile, (value) =>
            setProgress(Math.round(((index * 100) + value) / files.length)),
          );
          onSaved(item);
          savedCount += 1;
        } catch (reason) {
          failures.push(`${currentFile.name}：${reason instanceof Error ? reason.message : "保存失败"}`);
        }
      }
      for (const [index, remoteUrl] of normalizedRemoteUrls.entries()) {
        try {
          const parsed = new URL(remoteUrl);
          if (!/^https?:$/.test(parsed.protocol)) throw new Error("仅支持 http 或 https 视频链接");
          const titleFromUrl = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "远程视频")
            .replace(/\.[^.]+$/, "") || "远程视频";
          setStage(`正在下载并处理链接 ${index + 1}/${normalizedRemoteUrls.length}`);
          const result = await saveExternalInspirationReference({
            title: normalizedRemoteUrls.length === 1 && String(form.get("title") || "").trim()
              ? String(form.get("title")).trim()
              : titleFromUrl,
            sourceUrl: remoteUrl,
            market: String(form.get("market") || "未知市场"),
            exposure,
            days,
            durationSeconds: 0,
            platform: String(form.get("platform") || "手动链接导入"),
            spend: Number(form.get("spend")) || undefined,
            impressions: exposure || undefined,
            clicks: Number(form.get("clicks")) || undefined,
            ctr: Number(form.get("ctr")) || undefined,
            currency: String(form.get("currency") || "") || undefined,
          }, true);
          if (result.created) {
            onSaved(result.material);
            savedCount += 1;
          } else {
            failures.push(`${titleFromUrl}：已入库，未重复分析`);
          }
          setProgress(Math.round(((files.length + index + 1) * 100) / (files.length + normalizedRemoteUrls.length)));
        } catch (reason) {
          failures.push(`${remoteUrl}：${reason instanceof Error ? reason.message : "下载或保存失败"}`);
        }
      }
      if (!savedCount && failures.length) throw new Error(failures.join("；"));
      if (failures.length) setError(`已入库 ${savedCount} 个，以下文件未处理：${failures.join("；")}`);
      else setStage(`已完成 ${savedCount} 个文件入库`);
      if (savedCount) { setFiles([]); setRemoteUrls(""); }
      setSaving(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "素材保存失败");
      setSaving(false);
      setStage("");
    }
  };
  return (
    <div className={styles.modalBackdrop}>
      <form className={styles.uploadModal} onSubmit={submit} noValidate>
        <header>
          <div>
            <span className={styles.eyebrow}>MATERIAL INTAKE</span>
            <h2>买量素材入库</h2>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="关闭素材入库"
          >
            ×
          </button>
        </header>
        <div className={styles.uploadFields}>
          <label className={styles.fullField}>
            图片或视频文件
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
              disabled={saving}
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []));
                setError("");
              }}
            />
            <small>
              {files.length
                ? `${files.length} 个文件 · ${files.reduce((total, item) => total + item.size, 0) / 1024 / 1024 > 1024 ? `${(files.reduce((total, item) => total + item.size, 0) / 1024 / 1024 / 1024).toFixed(1)} GB` : `${(files.reduce((total, item) => total + item.size, 0) / 1024 / 1024).toFixed(1)} MB`}`
                : `支持 JPG、PNG、WebP、MP4、MOV、WebM；入库前自动查重`}
            </small>
            {files.length > 0 && (
              <div className={styles.batchFileList} aria-live="polite">
                {files.map((item) => (
                  <span key={`${item.name}-${item.lastModified}`}>{item.name}</span>
                ))}
              </div>
            )}
          </label>
          <label className={styles.fullField}>
            批量视频链接（可选）
            <textarea
              name="remoteUrls"
              className="resize-none"
              style={{ resize: "none" }}
              value={remoteUrls}
              disabled={saving}
              onChange={(event) => { setRemoteUrls(event.target.value); setError(""); }}
              placeholder={"每行一个可直接下载的视频链接\nhttps://example.com/ad-01.mp4\nhttps://example.com/ad-02.mp4"}
            />
            <small>网页会自动下载后入库、去重并进入分析队列；可与本地文件一起批量处理。</small>
          </label>
          <label>
            素材标题
            <input name="title" placeholder="默认使用文件名" />
          </label>
          <label>
            素材类型
            <select name="type" defaultValue="未判定" disabled={isImage}>
              <option>未判定</option>
              <option>原剧拼接</option>
              <option>解说</option>
              <option>AI前贴</option>
            </select>
            <small>
              {isImage
                ? "图片自动归为海报图片"
                : "可先留为未判定，等待自动分析"}
            </small>
          </label>
          <label>
            投放平台
            <input name="platform" placeholder="DataEye ADX / Meta / TikTok" />
          </label>
          <label>
            市场
            <input name="market" placeholder="美国、巴西等" />
          </label>
          <label>
            语种
            <input name="language" placeholder="英语、西班牙语等" />
          </label>
          <label>
            题材
            <input name="theme" placeholder="可留空，等待自动识别" />
          </label>
          <label>
            ADX 消耗
            <input name="spend" type="number" min="0" step="0.01" />
          </label>
          <label>
            币种
            <input name="currency" placeholder="USD / CNY" />
          </label>
          <label>
            真实曝光量
            <input name="exposure" type="number" min="0" />
          </label>
          <label>
            点击量
            <input name="clicks" type="number" min="0" />
          </label>
          <label>
            CTR
            <input name="ctr" type="number" min="0" step="0.0001" />
          </label>
          <label>
            真实跑量天数
            <input name="days" type="number" min="0" />
          </label>
          <label className={styles.fullField}>
            原始素材链接（本地文件可选）
            <input
              name="sourceUrl"
              type="url"
              placeholder="https://...（可选，用于来源追溯）"
            />
          </label>
          <label className={styles.fullField}>
            授权状态
            <select name="rightsStatus" defaultValue="仅限内部分析">
              <option>仅限内部分析</option>
              <option>授权待确认</option>
              <option>已获授权可制作</option>
              <option>已获授权可投放</option>
            </select>
            <small>授权未确认的素材只能用于内部分析，不能直接进入投放。</small>
          </label>
        </div>
        {saving && (
          <div
            className={styles.uploadProgress}
            role="status"
            aria-live="polite"
          >
            <div>
              <span>{stage}</span>
              <b>{progress}%</b>
            </div>
            <i>
              <em style={{ width: `${progress}%` }} />
            </i>
          </div>
        )}
        {error && (
          <p className={styles.uploadError} role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button className={styles.primary} disabled={saving}>
            {saving ? "正在入库…" : "校验并加入分析队列"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function TagList({ tags }: { tags: MaterialTag[] }) {
  return tags.length ? (
    <div className={styles.v2Tags}>
      {tags.map((tag, i) => {
        const scored = Number.isFinite(tag.confidence),
          needsReview = tag.verification !== "verified";
        return (
          <span
            className={needsReview ? styles.tagNeedsReview : ""}
            key={`${tag.code}-${i}`}
            title={
              scored
                ? `置信度 ${pct(tag.confidence)}% · ${needsReview ? "待复核" : "已验证"}`
                : "模型未提供置信度"
            }
          >
            {tag.label}
            {needsReview ? (
              <small>待复核</small>
            ) : (
              scored && <small>{pct(tag.confidence)}%</small>
            )}
          </span>
        );
      })}
    </div>
  ) : (
    <small className={styles.dimensionEmpty}>暂无可信结论</small>
  );
}
function Advice({ title, items }: { title: string; items: string[] }) {
  return (
    <article>
      <b>{title}</b>
      {items.length ? (
        <ul>
          {items.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      ) : (
        <small>暂无真实结论</small>
      )}
    </article>
  );
}
function InlineEmpty({ text }: { text: string }) {
  return <div className={styles.inlineEmpty}>{text}</div>;
}
function State({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={styles.statePanel}>
      <i>◇</i>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

export default InspirationWorkspace;
