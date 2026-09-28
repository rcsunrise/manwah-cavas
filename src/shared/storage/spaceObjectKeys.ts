// src/shared/storage/spaceObjectKeys.ts
// MANWAH Space Studio｜不可变对象存储 Key 规范与路径构造器 V3.0
// 强制规则：禁止直接使用 current.jpg 等可变文件名覆盖，所有资产路径必须具备确定性、唯一性与可追溯性。

export class SpaceObjectKeyBuilder {
  /**
   * 基础项目根路径
   */
  public static projectRoot(projectId: string): string {
    if (!projectId || projectId.trim() === '') {
      throw new Error('[SpaceObjectKeyBuilder] projectId is required');
    }
    return `projects/${projectId.trim()}`;
  }

  /**
   * 产品参考图路径
   * projects/{projectId}/products/{assetId}/refs/{referenceId}/{filename}
   */
  public static productReference(params: {
    projectId: string;
    assetId: string;
    referenceId: string;
    extension?: string;
  }): string {
    const { projectId, assetId, referenceId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/products/${assetId}/refs/${referenceId}/original.${extension}`;
  }

  /**
   * 空间户型参考图路径
   * projects/{projectId}/spaces/{spacePresetId}/refs/{referenceId}/{filename}
   */
  public static spaceReference(params: {
    projectId: string;
    spacePresetId: string;
    referenceId: string;
    extension?: string;
  }): string {
    const { projectId, spacePresetId, referenceId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/spaces/${spacePresetId}/refs/${referenceId}/original.${extension}`;
  }

  /**
   * 风格系统参考图路径
   * projects/{projectId}/styles/{stylePresetId}/refs/{referenceId}/{filename}
   */
  public static styleReference(params: {
    projectId: string;
    stylePresetId: string;
    referenceId: string;
    extension?: string;
  }): string {
    const { projectId, stylePresetId, referenceId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/styles/${stylePresetId}/refs/${referenceId}/original.${extension}`;
  }

  /**
   * A00 空间母版标准统一路径
   * projects/{id}/scene-masters/master-{rev}.webp
   */
  public static sceneMasterCanonical(params: {
    projectId: string;
    revisionId: string;
    extension?: string;
  }): string {
    const { projectId, revisionId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/scene-masters/master-${revisionId}.${extension}`;
  }

  /**
   * 镜头评审结果存储路径
   * projects/{id}/shots/{shotCode}/revisions/{rev}/validation.json
   */
  public static shotRevisionValidation(params: {
    projectId: string;
    shotId: string;
    revisionId: string;
  }): string {
    const { projectId, shotId, revisionId } = params;
    return `${this.projectRoot(projectId)}/shots/${shotId}/revisions/${revisionId}/validation.json`;
  }

  /**
   * 镜头提示词快照存储路径
   * projects/{id}/shots/{shotCode}/revisions/{rev}/prompt.json
   */
  public static shotRevisionPrompt(params: {
    projectId: string;
    shotId: string;
    revisionId: string;
  }): string {
    const { projectId, shotId, revisionId } = params;
    return `${this.projectRoot(projectId)}/shots/${shotId}/revisions/${revisionId}/prompt.json`;
  }

  /**
   * A00 空间母版 (Scene Master) 路径
   * projects/{projectId}/scene-masters/{sceneMasterId}/{revisionId}/master.{extension}
   */
  public static sceneMaster(params: {
    projectId: string;
    sceneMasterId: string;
    revisionId: string;
    extension?: string;
  }): string {
    const { projectId, sceneMasterId, revisionId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/scene-masters/${sceneMasterId}/${revisionId}/master.${extension}`;
  }

  /**
   * 镜头修订版本原图路径
   * projects/{projectId}/shots/{shotId}/revisions/{revisionId}/original.{extension}
   */
  public static shotRevisionOriginal(params: {
    projectId: string;
    shotId: string;
    revisionId: string;
    extension?: string;
  }): string {
    const { projectId, shotId, revisionId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/shots/${shotId}/revisions/${revisionId}/original.${extension}`;
  }

  /**
   * 镜头修订版本缩略图路径
   * projects/{projectId}/shots/{shotId}/revisions/{revisionId}/thumb.{extension}
   */
  public static shotRevisionThumbnail(params: {
    projectId: string;
    shotId: string;
    revisionId: string;
    extension?: string;
  }): string {
    const { projectId, shotId, revisionId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/shots/${shotId}/revisions/${revisionId}/thumb.${extension}`;
  }

  /**
   * 模特资产参考图路径
   * projects/{projectId}/humans/{humanAssetId}/refs/{referenceId}/original.{extension}
   */
  public static humanReference(params: {
    projectId: string;
    humanAssetId: string;
    referenceId: string;
    extension?: string;
  }): string {
    const { projectId, humanAssetId, referenceId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/humans/${humanAssetId}/refs/${referenceId}/original.${extension}`;
  }

  /**
   * 模特植入合成版本路径 (Human Pass)
   * projects/{projectId}/human-composites/{compositeId}/{revisionId}/original.{extension}
   */
  public static humanComposite(params: {
    projectId: string;
    compositeId: string;
    revisionId: string;
    extension?: string;
  }): string {
    const { projectId, compositeId, revisionId, extension = 'webp' } = params;
    return `${this.projectRoot(projectId)}/human-composites/${compositeId}/${revisionId}/original.${extension}`;
  }

  /**
   * 最终全案导出包路径
   * projects/{projectId}/exports/{exportId}/{filename}
   */
  public static exportPackage(params: {
    projectId: string;
    exportId: string;
    fileName: string;
  }): string {
    const { projectId, exportId, fileName } = params;
    return `${this.projectRoot(projectId)}/exports/${exportId}/${fileName}`;
  }
}
