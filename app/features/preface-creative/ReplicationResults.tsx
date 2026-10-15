"use client";

import { useEffect, useRef, useState } from "react";
import type { PromptFissionPlan } from "../../lib/material-library-store";
import type { PrefaceCreativeModelProvider } from "../../lib/preface-creative-domain";
import styles from "./PrefaceCreativeWorkspace.module.css";

type Delivery = { script: string; storyboardScript: string; version: number; createdAt: string; warning?: string };
type Props = { plan: PromptFissionPlan; brief: string; provider?: PrefaceCreativeModelProvider; onNotify?: (message: string) => void };

export default function ReplicationResults({ plan, brief, provider, onNotify }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [rejected, setRejected] = useState<number[]>([]);
  const [deliveries, setDeliveries] = useState<Record<number, Delivery[]>>({});
  const deliveriesRef = useRef(deliveries);
  const running = useRef(new Set<number>());
  const [active, setActive] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [batch, setBatch] = useState<{ completed: number; total: number } | null>(null);
  const batchRef = useRef(false);
  const storageKey = `lumina:replication-deliveries:${plan.id}`;
  useEffect(() => {
    let cancelled = false;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      deliveriesRef.current = saved; setDeliveries(saved);
    } catch { /* Server history remains available if browser storage is unavailable. */ }
    void fetch(`/api/preface-creative/replication-script?assetId=${encodeURIComponent(plan.sourceAssetId)}&planId=${encodeURIComponent(plan.id)}`).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      if (cancelled || !Array.isArray(payload.records)) return;
      const next = { ...deliveriesRef.current };
      for (const record of payload.records) {
        const index = Number(record.candidateIndex);
        if (!Number.isInteger(index) || index < 0 || index >= plan.variants.length) continue;
        if (!(next[index] || []).some((item) => item.createdAt === record.createdAt)) next[index] = [...(next[index] || []), record].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-20);
      }
      deliveriesRef.current = next; setDeliveries(next);
    }).catch(() => { /* Keep locally restored results when the service is offline. */ });
    return () => { cancelled = true; };
  }, [storageKey, plan.id, plan.sourceAssetId, plan.variants.length]);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); onNotify?.("已复制"); }
    catch { onNotify?.("复制失败，请选中文本后复制"); }
  };
  const generate = async (index: number) => {
    if (running.current.has(index)) return;
    running.current.add(index); setActive([...running.current]);
    setErrors((current) => ({ ...current, [index]: "" }));
    try {
      const response = await fetch("/api/preface-creative/replication-script", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(540_000),
        body: JSON.stringify({ assetId: plan.sourceAssetId, planId: plan.id, candidateIndex: index, variant: plan.variants[index], brief, provider }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "脚本与分镜生成失败");
      const next = { ...deliveriesRef.current, [index]: [...(deliveriesRef.current[index] || []), payload].slice(-20) };
      deliveriesRef.current = next; setDeliveries(next);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { onNotify?.("浏览器缓存未保存，请复制结果；服务端保存状态见卡片提示"); }
    } catch (reason) {
      setErrors((current) => ({ ...current, [index]: reason instanceof Error ? reason.message : "生成失败，请重试" }));
    } finally { running.current.delete(index); setActive([...running.current]); }
  };
  const generateBatch = async () => {
    if (batchRef.current || running.current.size) return;
    const indices = selected.filter((index) => !rejected.includes(index));
    if (!indices.length) return;
    batchRef.current = true; setBatch({ completed: 0, total: indices.length });
    try {
      // Sequential requests avoid a burst of long model calls; one failure does not stop the batch.
      for (let position = 0; position < indices.length; position++) {
        await generate(indices[position]); setBatch({ completed: position + 1, total: indices.length });
      }
    } finally { batchRef.current = false; setBatch(null); }
  };
  return <>
    <div className={styles.replicationBatchBar}>
      <label><input type="checkbox" disabled={!!batch} checked={selected.length > 0 && selected.length === plan.variants.length - rejected.length} onChange={(event) => setSelected(event.target.checked ? plan.variants.map((_, index) => index).filter((index) => !rejected.includes(index)) : [])} /> 全选可用候选</label>
      <span role="status">{batch ? `已处理 ${batch.completed}/${batch.total} 条（含失败项）` : `已选 ${selected.filter((index) => !rejected.includes(index)).length} 条`}</span>
      <button type="button" className={styles.primary} disabled={!selected.filter((index) => !rejected.includes(index)).length || !!active.length || !!batch} aria-busy={!!batch} onClick={() => void generateBatch()}>{batch ? <><i className={styles.streamSpinner} aria-hidden="true" />批量生成中 {batch.completed}/{batch.total}</> : "批量生成脚本与分镜"}</button>
    </div>
    <div className={styles.branchGrid}>{plan.variants.map((variant, index) => {
      const history = deliveries[index] || [];
      const latest = history.at(-1);
      const busy = active.includes(index);
      const discarded = rejected.includes(index);
      return <article className={styles.branchCard} key={`${plan.id}-${index}`}>
        <header><span>{variant.title}</span><b>{discarded ? "已淘汰" : variant.branchLabel}</b></header>
        <h3>{variant.synopsis}</h3><p>{variant.difference}</p>
        <div className={styles.cardActions}>
          <label><input type="checkbox" checked={selected.includes(index)} disabled={discarded || !!batch} onChange={(event) => setSelected((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index))} /> 批量</label>
          <button type="button" disabled={busy || !!batch} onClick={() => { setRejected((current) => discarded ? current.filter((item) => item !== index) : [...current, index]); setSelected((current) => current.filter((item) => item !== index)); }}>{discarded ? "恢复候选" : "淘汰"}</button>
          <button type="button" onClick={() => void copy([variant.synopsis, latest?.script || variant.prompt, latest?.storyboardScript || ""].join("\n\n"))}>一键复制</button>
        </div>
        <button type="button" className={styles.primary} disabled={busy || !!batch || discarded} aria-busy={busy} onClick={() => void generate(index)}>{busy ? <><i className={styles.streamSpinner} aria-hidden="true" />正在生成脚本与分镜…</> : latest ? "重新生成脚本与分镜" : "生成脚本与分镜"}</button>
        {busy && <p role="status">本条任务进行中，完成或失败后动画会自动停止。</p>}
        {errors[index] && <div className={styles.error} role="alert">{errors[index]}，可重试；已有版本保留。</div>}
        {history.map((delivery, versionIndex) => <details key={`${delivery.createdAt}-${versionIndex}`} open={versionIndex === history.length - 1} className={styles.replicationDelivery}>
          <summary>{variant.title} · V{delivery.version || versionIndex + 1}</summary>
          <header><b>完整脚本</b><button type="button" onClick={() => void copy(delivery.script)}>复制完整脚本</button></header><pre>{delivery.script || "本次未返回完整脚本，可重新生成。"}</pre>
          <header><b>分镜脚本</b><button type="button" onClick={() => void copy(delivery.storyboardScript)}>复制分镜脚本</button></header><pre>{delivery.storyboardScript || "本次未返回分镜，可重新生成；完整脚本已保留。"}</pre>
          {delivery.warning && <p role="status">{delivery.warning}</p>}
        </details>)}
        <details><summary>查看完整提示词</summary><pre>{variant.prompt}</pre></details>
      </article>;
    })}</div>
  </>;
}
