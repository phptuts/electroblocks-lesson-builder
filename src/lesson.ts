export interface Lesson {
  title: string;
  steps: Step[];
  id: string;
  contentType: "mp4" | "jpg" | "gif" | "png" | "ogg";
  folderName: string;
  authorFolderName: string;
  author: string;
  email: string;
  version: number;
}

export interface Step {
  title: string;
  contentType: "mp4" | "jpg" | "gif" | "png" | "ogg";
  id: string;
}
