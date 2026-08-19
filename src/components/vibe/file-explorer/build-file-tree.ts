export interface FileNode {
	children?: FileNode[];
	expanded?: boolean;
	name: string;
	path: string;
	type: "file" | "folder";
}

interface FileNodeBuilder {
	children?: { [key: string]: FileNodeBuilder };
	expanded?: boolean;
	name: string;
	path: string;
	type: "file" | "folder";
}

function collectExpansionState(nodes: FileNode[]): Map<string, boolean> {
	const map = new Map<string, boolean>();
	for (const node of nodes) {
		if (node.type === "folder") {
			map.set(node.path, !!node.expanded);
			if (node.children) {
				for (const [k, v] of collectExpansionState(node.children)) {
					map.set(k, v);
				}
			}
		}
	}
	return map;
}

export function buildFileTree(
	paths: string[],
	previousTree?: FileNode[],
): FileNode[] {
	if (paths.length === 0) return [];

	const expansionState = previousTree
		? collectExpansionState(previousTree)
		: new Map<string, boolean>();
	const root: { [key: string]: FileNodeBuilder } = {};

	for (const path of paths) {
		const parts = path.split("/").filter(Boolean);
		let current = root;
		let currentPath = "";

		for (let index = 0; index < parts.length; index++) {
			const part = parts[index];
			currentPath += `/${part}`;
			const isFile = index === parts.length - 1;

			if (!current[part]) {
				current[part] = {
					name: part,
					type: isFile ? "file" : "folder",
					path: currentPath,
					children: isFile ? undefined : {},
					expanded: expansionState.get(currentPath) ?? !isFile,
				};
			}

			if (!isFile) {
				const child = current[part];
				if (child?.children) {
					current = child.children;
				}
			}
		}
	}

	const convertToArray = (obj: {
		[key: string]: FileNodeBuilder;
	}): FileNode[] => {
		return Object.values(obj)
			.map(
				(node): FileNode => ({
					...node,
					children: node.children ? convertToArray(node.children) : undefined,
				}),
			)
			.sort((a, b) => {
				if (a.type !== b.type) {
					return a.type === "folder" ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
	};

	return convertToArray(root);
}
