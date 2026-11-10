"""
MR VISUALS — descriptions des photos (textes alternatifs) et contenu des pages de collection.

Les textes alternatifs servent à Google Images, aux lecteurs d'écran et quand une image ne charge pas.
Pour une nouvelle photo, ajouter une ligne dans ALT (clé = nom du fichier sans extension) :
un texte court et concret qui décrit ce qu'on voit.
"""

ALT = {
    # --- golf · série « Golden Hour » (fin de journée) --------------------------------------
    "DSCF3053": "Deux golfeurs s'entraînent au putting sur le green en fin de journée",
    "DSCF3058": "Golfeuse en polo bleu concentrée à l'adresse, lumière dorée de fin de journée",
    "DSCF3062": "Golfeuse au putting sur le green, balles au sol, photo en noir et blanc",
    "DSCF3065": "Golfeuse au putting, drapeau numéroté 7 au premier plan",
    "DSCF3069": "Golfeur en pantalon rouge qui putte près du trou sur un green éclairé par le soleil couchant",
    "DSCF3080": "Golfeuse poing serré après un coup réussi",
    "DSCF3084": "Portrait de profil d'une golfeuse en polo bleu, lumière dorée",
    "DSCF3165": "Golfeur lors d'un coup d'approche, photo en noir et blanc",
    "DSCF3226": "Silhouette d'un golfeur, driver levé vers le ciel bleu",
    "DSCF3237": "Golfeur en pantalon rouge à l'approche, club au sol, lumière orangée",
    "DSCF3270": "Golfeuse en plein swing, finish du coup, lumière dorée",
    "DSCF3307": "Golfeuse en fin de swing, bras levés, balle partie",
    "DSCF3314": "Portrait d'une golfeuse souriante en polo bleu dans une voiturette de golf",
    "DSCF3371": "Swing décomposé, l'adresse : golfeur à casquette face à la balle",
    "DSCF3381": "Swing décomposé, la montée : club levé à la verticale",
    "DSCF3382": "Swing décomposé, la descente : mains basses avant l'impact",
    "DSCF3386": "Swing décomposé, le finish : club passé au-dessus de l'épaule",
    "DSCF3472": "Golfeuse en plein swing sous les arbres, photo en noir et blanc",
    "DSCF3491": "Golfeuse en plein swing, voiturette de golf au premier plan",
    "DSCF3516": "Golfeur souriant au sommet de son swing, lumière orangée",
    "DSCF3601": "Golfeuse souriante assise dans une voiturette de golf",
    "DSCF3603": "Deux golfeurs rient dans une voiturette de golf, la golfeuse applaudit",
    "DSCF3604": "Golfeuse dans un bunker de sable, club en main avant le coup",
    # --- golf · premiers swings (tee de départ) -------------------------------------------------
    "DSCF0654": "Golfeur en finish de swing, photo en noir et blanc",
    "DSCF0655": "Golfeur en plein swing, club derrière la tête, au milieu de la verdure",
    "DSCF0660": "Gros plan d'un golfeur au sommet de son swing, noir et blanc",
    "DSCF0672": "Golfeur en finish de swing sur le fairway, noir et blanc",
    "DSCF0691": "Golfeur à l'approche dans l'herbe sèche, noir et blanc",
    "DSCF0693": "Golfeur lors d'un coup d'approche dans l'herbe haute",
    "DSCF0712": "Golfeur de dos au moment de la montée du swing",
    "DSCF0715": "Golfeur à l'impact, club près de la balle",
    "DSCF0721": "Golfeur en finish de swing, noir et blanc",
    "DSCF0734": "Golfeur au finish d'un swing, club levé",
    "DSCF0735": "Golfeur dans son finish, arbres en arrière-plan",
    "DSCF0752": "Golfeur au départ, tee jaune au sol",
    "DSCF0783": "Golfeur à l'adresse, driver posé derrière la balle sur le tee",
    "DSCF0785": "Golfeur à l'adresse, concentré avant le swing",
    "DSCF0786": "Golfeur à la montée du swing, tee jaune au premier plan",
    "DSCF0788": "Golfeur en plein finish de swing sur le tee de départ",
    # --- portrait ----------------------------------------------------------------------------------
    "DB1A6329-B156-465D-AE1E-34B82695212A": "Portrait d'un homme en pull bleu marine, regard caméra, fond de verdure",
    "DSC_8825": "Autoportrait de Mathis, photographe, appareil en main devant un cerisier en fleurs",
    "DSC_8826": "Mathis souriant, appareil photo à la main, devant un cerisier en fleurs",
    "DSCF0317": "Portrait d'un jeune homme en polo blanc tenant une boule de pétanque",
    "DSCF0318": "Portrait d'un jeune homme en polo blanc, geste de la main",
    "DSCF0851": "Portrait d'une jeune femme assise dans l'herbe, gilet en maille vert",
    # --- danse -------------------------------------------------------------------------------------
    "DSCF9553": "Trois danseurs sur scène dans la fumée, lumières violettes",
    "DSCF9558-2": "Danseuse en silhouette dans la fumée, bras levés, éclairage rouge",
    "DSCF9558": "Danseuse en silhouette dans la fumée, bras levés, noir et blanc",
    # --- automobile ------------------------------------------------------------------------------
    "DSCF0893": "Avant d'une berline grise : phare et calandre",
    "DSCF0909": "Volant et écran de bord d'une voiture moderne",
    # --- nature ------------------------------------------------------------------------------------
    "DSCF0170": "Branches de cerisier en fleurs blanches",
    "DSCF0178": "Branches de cerisier en fleurs roses",
    "DSCF0432": "Orchidées blanches et violettes en gros plan",
    "DSCF0433": "Rose rose en gros plan",
    "DSCF0819": "Trois pâquerettes dans l'herbe",
    "DSCF0824": "Petite cascade sur une rivière entourée de verdure",
    "DSCF0835": "Rivière bordée de saules pleureurs",
    "DSCF0840": "Prairie fleurie, fleurs bleues et jaunes dans l'herbe haute",
    "DSCF0842": "Paysage de campagne verdoyante sous un ciel nuageux",
}

# Collections : une page chacune (slug = nom du fichier .html). « cat » = dossier d'images.
COLLECTIONS = [
    {
        "slug": "golf", "cat": "golf", "name": "Golf", "nav": "Golf",
        "title": "Photographe de golf en Vendée — Collection golf | MR VISUALS",
        "description": "Photographies de golf par MR VISUALS, photographe en Vendée : swings décomposés, putts, portraits de joueurs et série golden hour sur les parcours du Grand Ouest.",
        "lede": "L'élégance du green, du swing au finish.",
        "intro": [
            "Le golf est la discipline que je photographie le plus. Un swing dure une fraction de seconde : "
            "je le décompose, je guette le finish, le regard après un putt, la lumière rasante de fin de journée.",
            "Cette collection réunit deux séries : « Golden Hour », réalisée au coucher du soleil, et mes premiers swings "
            "sur le tee de départ, en couleur et en noir et blanc. Clubs, compétitions, joueurs ou simple envie de beaux "
            "souvenirs sur le parcours : j'interviens en Vendée et dans tout le Grand Ouest.",
        ],
        "keywords": "photographe golf Vendée, photo de swing, séance photo golf, golden hour",
    },
    {
        "slug": "portrait", "cat": "portrait", "name": "Portrait", "nav": "Portrait",
        "title": "Photographe portrait en Vendée — Séance en extérieur | MR VISUALS",
        "description": "Portraits en lumière naturelle par MR VISUALS, photographe en Vendée : séances individuelles, couples, familles et portraits professionnels en extérieur.",
        "lede": "L'âme du regard, en lumière naturelle.",
        "intro": [
            "Un portrait réussi tient à peu de choses : un regard, une lumière, la confiance qui s'installe pendant la séance. "
            "Je travaille en lumière naturelle, en extérieur, avec des zooms f/2.8 pour un visage net et un fond doux.",
            "Séances individuelles, couples, familles, portraits professionnels : on prépare ensemble l'ambiance et le lieu, "
            "en Vendée ou ailleurs dans le Grand Ouest.",
        ],
        "keywords": "photographe portrait Vendée, séance portrait extérieur, portrait professionnel",
    },
    {
        "slug": "danse", "cat": "danse", "name": "Danse", "nav": "Danse",
        "title": "Photographe de danse et de spectacle en Vendée | MR VISUALS",
        "description": "Photographies de danse et de scène par MR VISUALS : silhouettes dans la fumée, contre-jours et mouvements figés pendant les spectacles, en Vendée et dans le Grand Ouest.",
        "lede": "La grâce du mouvement, figée sur scène.",
        "intro": [
            "La danse se photographie dans la pénombre, avec des lumières qui changent à chaque seconde. Je cherche la silhouette "
            "dans la fumée, le contre-jour, le geste saisi au bon moment, sans gêner le spectacle.",
            "Écoles de danse, compagnies, galas : contactez-moi pour couvrir votre représentation ou réaliser des photos de scène.",
        ],
        "keywords": "photographe danse Vendée, photo de spectacle, photographe gala de danse",
    },
    {
        "slug": "automobile", "cat": "voiture", "name": "Automobile", "nav": "Automobile",
        "title": "Photographe automobile en Vendée — Voitures | MR VISUALS",
        "description": "Photographie automobile par MR VISUALS : détails, lignes et lumière sur les voitures, pour particuliers et professionnels, en Vendée et dans le Grand Ouest.",
        "lede": "Les lignes et la lumière.",
        "intro": [
            "Une voiture, ce sont des lignes, des reflets et des détails : une calandre, un phare, un volant. Je photographie "
            "les véhicules en extérieur, en lumière naturelle, pour des particuliers, des passionnés ou des professionnels "
            "(garages, concessions, clubs).",
            "D'autres séries arrivent : si vous avez un véhicule à mettre en valeur, écrivez-moi.",
        ],
        "keywords": "photographe automobile Vendée, photo de voiture, shooting voiture",
    },
    {
        "slug": "nature", "cat": "nature", "name": "Nature", "nav": "Nature",
        "title": "Photographie de nature : fleurs et paysages | MR VISUALS",
        "description": "Photographies de nature par MR VISUALS : cerisiers en fleurs, roses, orchidées, prairies fleuries et rivières, entre gros plans et paysages.",
        "lede": "La beauté du monde, du gros plan au paysage.",
        "intro": [
            "Entre deux séances, je photographie ce qui m'entoure : la floraison des cerisiers, une rose, des fleurs des champs, "
            "l'eau d'une rivière.",
            "La nature est mon terrain de jeu pour travailler la lumière, le gros plan et la profondeur de champ.",
        ],
        "keywords": "photographie nature, photo de fleurs, cerisier en fleurs, paysage",
    },
]

SLUG_BY_CAT = {c["cat"]: c["slug"] for c in COLLECTIONS}

# Photos mises en avant par collection (images de partage et cartes « Autres collections »).
# Si l'une d'elles est retirée de la galerie, le site prend automatiquement la première photo de la collection.
PICKS = {
    "golf": ["DSCF3270", "DSCF3314", "DSCF3226"],
    "portrait": ["DB1A6329-B156-465D-AE1E-34B82695212A", "DSC_8826", "DSCF0851"],
    "danse": ["DSCF9558", "DSCF9558-2", "DSCF9553"],
    "voiture": ["DSCF0893", "DSCF0909", "DSCF0893"],
    "nature": ["DSCF0433", "DSCF0178", "DSCF0824"],
}
