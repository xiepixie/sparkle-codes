// @ts-nocheck
import * as __fd_glob_19 from "../content/docs/resources/学习领域-资源-建站-端口转发配置.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/resources/学习领域-资源-建站-vps购买.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/resources/学习领域-资源-建站-ssh服务-排查.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/resources/学习领域-资源-建站-1panel.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/resources/学习领域-资源-docker-k8s-k8s-pod.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/projects/学习领域-项目-强化计算机网络.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/projects/学习领域-项目-强化计算机组成原理.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/projects/学习领域-项目-强化数据结构.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/projects/学习领域-项目-强化操作系统.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/projects/学习领域-项目-导师.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/projects/学习领域-项目-多agents.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/projects/test.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/getting-started/overview.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/getting-started/index.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/resources/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/projects/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/misc/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "getting-started/meta.json": __fd_glob_1, "misc/meta.json": __fd_glob_2, "projects/meta.json": __fd_glob_3, "resources/meta.json": __fd_glob_4, }, {"index.mdx": __fd_glob_5, "getting-started/index.mdx": __fd_glob_6, "getting-started/overview.mdx": __fd_glob_7, "projects/test.mdx": __fd_glob_8, "projects/学习领域-项目-多agents.mdx": __fd_glob_9, "projects/学习领域-项目-导师.mdx": __fd_glob_10, "projects/学习领域-项目-强化操作系统.mdx": __fd_glob_11, "projects/学习领域-项目-强化数据结构.mdx": __fd_glob_12, "projects/学习领域-项目-强化计算机组成原理.mdx": __fd_glob_13, "projects/学习领域-项目-强化计算机网络.mdx": __fd_glob_14, "resources/学习领域-资源-docker-k8s-k8s-pod.mdx": __fd_glob_15, "resources/学习领域-资源-建站-1panel.mdx": __fd_glob_16, "resources/学习领域-资源-建站-ssh服务-排查.mdx": __fd_glob_17, "resources/学习领域-资源-建站-vps购买.mdx": __fd_glob_18, "resources/学习领域-资源-建站-端口转发配置.mdx": __fd_glob_19, });