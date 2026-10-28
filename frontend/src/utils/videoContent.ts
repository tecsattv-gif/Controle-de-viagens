// Lista de vídeos tutoriais mostrados em Ajuda e Tutoriais.
// Os vídeos ficam dentro do app (assets/videos), então funcionam sem internet.
// Para acrescentar um vídeo novo, basta colocar o arquivo .mp4 em
// assets/videos, uma capa em assets/images e adicionar um item no fim da lista.

export type TutorialVideo = {
  id: string;
  title: string;
  description: string;
  duration: string;
  source: number;
  thumbnail: number;
};

export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  {
    id: "backup-restauracao",
    title: "Backup e restauração",
    description: "Como guardar seus dados no Google Drive e trazê-los de volta num celular novo",
    duration: "1:53",
    source: require("../../assets/videos/tutorial-backup-restauracao.mp4"),
    thumbnail: require("../../assets/images/video-thumb-backup.jpg"),
  },
];
