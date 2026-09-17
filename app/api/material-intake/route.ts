import { NextRequest, NextResponse } from "next/server";
import { classifyIntakeMedia, extensionForMime, normalizeAdxMetrics } from "../../lib/material-intake-domain";

const PB_URL=(process.env.NEXT_PUBLIC_POCKETBASE_URL||"http://127.0.0.1:8090").replace(/\/$/,"");

function safeName(value:string,extension:string){return (value.replace(/[\\/:*?"<>|]/g,"_").replace(/\.[^.]+$/,"").slice(0,100)||"remote-material")+extension}
function escapeFilter(value:string){return value.replace(/"/g,'\\"')}
async function findExisting(filter:string){
  const response=await fetch(`${PB_URL}/api/collections/ad_materials/records?perPage=1&filter=${encodeURIComponent(filter)}`,{cache:"no-store"});
  if(!response.ok)return undefined;
  const payload=await response.json() as {items?:unknown[]};
  return payload.items?.[0];
}
async function sha256(blob:Blob){
  const digest=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function POST(request:NextRequest){
  try{
    const input=await request.json() as Record<string,unknown>;
    const sourceUrl=String(input.sourceUrl||"");
    if(!/^https?:\/\//i.test(sourceUrl))return NextResponse.json({message:"远程素材地址无效"},{status:400});
    const sourceIdentityHash=String(input.sourceIdentityHash||"");
    if(!/^[a-f0-9]{64}$/i.test(sourceIdentityHash))return NextResponse.json({message:"入库来源去重键无效"},{status:400});
    // content_hash held the ADX identity hash in older records. Keep checking it
    // here so the new two-level scheme remains backward compatible.
    const sourceFilter=`source_identity_hash="${sourceIdentityHash}" || content_hash="${sourceIdentityHash}" || source_url="${escapeFilter(sourceUrl)}"`;
    const sourceDuplicate=await findExisting(sourceFilter);
    if(sourceDuplicate)return NextResponse.json({record:sourceDuplicate,created:false,analysisQueued:false});
    const mediaResponse=await fetch(sourceUrl,{cache:"no-store",signal:AbortSignal.timeout(120_000)});
    if(!mediaResponse.ok||!mediaResponse.body)return NextResponse.json({message:`远程视频下载失败（HTTP ${mediaResponse.status}）`},{status:502});
    const blob=await mediaResponse.blob();
    if(!blob.size)return NextResponse.json({message:"远程视频为空"},{status:422});
    const mimeType=(blob.type||mediaResponse.headers.get("content-type")||String(input.mimeType||"")).split(";")[0].trim().toLowerCase();
    const media=classifyIntakeMedia(mimeType);
    if(!media)return NextResponse.json({message:`不支持的素材格式：${mimeType||"未知类型"}`},{status:422});
    const extension=extensionForMime(mimeType);
    const contentHash=await sha256(blob);
    const contentDuplicate=await findExisting(`content_hash="${contentHash}"`);
    if(contentDuplicate)return NextResponse.json({record:contentDuplicate,created:false,analysisQueued:false});
    const form=new FormData();
    const adxMetrics=normalizeAdxMetrics({spend:input.spend,impressions:input.impressions??input.exposure,clicks:input.clicks,ctr:input.ctr,days:input.days,currency:input.currency,updatedAt:input.metricsUpdatedAt});
    const values:Record<string,string>={title:String(input.title||"远程素材"),type:media.materialType==="poster_image"?"海报图片":"未判定",source:"外部",platform:String(input.platform||"DataEye ADX").slice(0,120),market:String(input.market||"ADX 市场").slice(0,120),language:"未知语种",theme:"待分析",exposure:String(Number(input.exposure)||0),days:String(Number(input.days)||0),original_name:safeName(String(input.title||"remote-material"),extension),mime_type:mimeType,byte_size:String(blob.size),duration_seconds:media.mediaKind==="video"?String(Number(input.durationSeconds)||0):"0",source_identity_hash:sourceIdentityHash,content_hash:contentHash,source_url:sourceUrl,rights_status:"仅限内部分析",analysis_progress:"0",review_status:"待复核",intake_status:"stored",intake_batch_id:String(input.batchId||""),media_kind:media.mediaKind,material_type:media.materialType,audience_type:"undetermined",genre_tags:"[]",adx_metrics:JSON.stringify(adxMetrics),classification_source:"import",library_bucket:"running",classification_confidence:media.mediaKind==="image"?"1":"0",classification_reasons:JSON.stringify(media.mediaKind==="image"?[{reason:"文件 MIME 类型为图片"}]:[])};
    if(input.autoAnalyze===true)values.analysis_status="queued";
    Object.entries(values).forEach(([key,value])=>form.set(key,value));
    form.set(media.fileField,blob,safeName(String(input.title||"remote-material"),extension));
    const savedResponse=await fetch(`${PB_URL}/api/collections/ad_materials/records`,{method:"POST",body:form});
    const record=await savedResponse.json();
    if(!savedResponse.ok){
      // A concurrent intake may have won either unique index after our checks.
      const duplicate=await findExisting(`source_identity_hash="${sourceIdentityHash}" || content_hash="${contentHash}" || source_url="${escapeFilter(sourceUrl)}"`);
      if(duplicate)return NextResponse.json({record:duplicate,created:false,analysisQueued:false});
      return NextResponse.json(record,{status:savedResponse.status});
    }
    return NextResponse.json({record,created:true,analysisQueued:input.autoAnalyze===true});
  }catch(reason){return NextResponse.json({message:reason instanceof Error?reason.message:"远程素材入库失败"},{status:500})}
}
