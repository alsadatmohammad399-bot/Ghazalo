import {
  MENU_TEMPLATES_LIST,
  getMenuTemplateConfig,
  normalizeMenuTemplateId,
  type MenuTemplateConfig,
  type ShopMenuTemplateId,
} from '../types';

export type MenuTemplateMeta = MenuTemplateConfig;

export const MENU_TEMPLATES: MenuTemplateConfig[] = MENU_TEMPLATES_LIST;

export function getMenuTemplateMeta(id?: ShopMenuTemplateId | string | null): MenuTemplateConfig {
  return getMenuTemplateConfig(id);
}

export { normalizeMenuTemplateId };
