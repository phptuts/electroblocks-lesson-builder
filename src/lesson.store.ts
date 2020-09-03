import { writable } from "svelte/store";
import type { Lesson } from "./lesson";
import { v4 as generaterId } from "uuid";

const lessonStore = writable<Lesson>({
  title: "",
  id: generaterId(),
  version: 1,
  contentType: "png",
  folderName: "",
  author: "",
  authorFolderName: "",
  level: "Beginner",
  category: "",
  company: "",
  email: "",
  steps: [],
});

export default {
  subscribe: lessonStore.subscribe,
  set: lessonStore.set,
};
