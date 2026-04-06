// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "getting-started/index.mdx": () => import("../content/docs/getting-started/index.mdx?collection=docs"), "getting-started/overview.mdx": () => import("../content/docs/getting-started/overview.mdx?collection=docs"), "projects/test.mdx": () => import("../content/docs/projects/test.mdx?collection=docs"), "projects/学习领域-项目-多agents.mdx": () => import("../content/docs/projects/学习领域-项目-多agents.mdx?collection=docs"), "projects/学习领域-项目-导师.mdx": () => import("../content/docs/projects/学习领域-项目-导师.mdx?collection=docs"), "projects/学习领域-项目-强化操作系统.mdx": () => import("../content/docs/projects/学习领域-项目-强化操作系统.mdx?collection=docs"), "projects/学习领域-项目-强化数据结构.mdx": () => import("../content/docs/projects/学习领域-项目-强化数据结构.mdx?collection=docs"), "projects/学习领域-项目-强化计算机组成原理.mdx": () => import("../content/docs/projects/学习领域-项目-强化计算机组成原理.mdx?collection=docs"), "projects/学习领域-项目-强化计算机网络.mdx": () => import("../content/docs/projects/学习领域-项目-强化计算机网络.mdx?collection=docs"), "resources/学习领域-资源-docker-k8s-k8s-pod.mdx": () => import("../content/docs/resources/学习领域-资源-docker-k8s-k8s-pod.mdx?collection=docs"), "resources/学习领域-资源-建站-1panel.mdx": () => import("../content/docs/resources/学习领域-资源-建站-1panel.mdx?collection=docs"), "resources/学习领域-资源-建站-ssh服务-排查.mdx": () => import("../content/docs/resources/学习领域-资源-建站-ssh服务-排查.mdx?collection=docs"), "resources/学习领域-资源-建站-vps购买.mdx": () => import("../content/docs/resources/学习领域-资源-建站-vps购买.mdx?collection=docs"), "resources/学习领域-资源-建站-端口转发配置.mdx": () => import("../content/docs/resources/学习领域-资源-建站-端口转发配置.mdx?collection=docs"), }),
};
export default browserCollections;