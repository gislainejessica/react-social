const { admin } = require('../util/admin');
const firebase = require('firebase');
const config = require('../util/config');
const { validarRegistroDados, validarLoginDados, reduceUseDatails } = require('../util/validadores');

firebase.initializeApp(config);

exports.registrar = (req, res) => {
    const novoUser = {
        email: req.body.email,
        senha: req.body.senha,
        confirmSenha: req.body.confirmSenha,
        handle: req.body.handle,
    }
    const {valid, erros} = validarRegistroDados(novoUser)
    if (!valid) 
        return res.status(400).json({erros})
    const noImg = "no-img.png"

    admin.firestore().doc(`/users/${novoUser.handle}`).get().then(doc => {
        if (doc.exists)
            return res.status(400).json({handle : "Esse usuário já existe"})
        else{
            return firebase.auth().createUserWithEmailAndPassword(novoUser.email, novoUser.senha)
                .then( data => {
                    userId = data.user.uid
                    return data.user.getIdToken()
                })
                .then( (idToken) => {
                    token = idToken
                    const userCredencial = {
                        handle:novoUser.handle,
                        email:novoUser.email,
                        createAt:new Date().toISOString(),
                        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
                        userId
                    }
                    return admin.firestore().doc(`/users/${novoUser.handle}`).set(userCredencial)
                })
                .then(() =>{
                    return res.status(201).json(token)
                })
                .catch(err => {
                    console.error(err)
                    if( err.code === "auth/email-already-in-use" ){
                        return res.status(400).json({ email: "Email já está sendo usado"})
                    }
                    else{
                        return res.status(500).json({general: "Alguma coisa deu errada, tente outra vez"})
                    }
                })
        }
    })
};

exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        senha: req.body.senha
    }
    const {valid, erros} = validarLoginDados(user)
    if (!valid) 
        return res.status(400).json({erros})

    firebase.auth().signInWithEmailAndPassword(user.email, user.senha)
        .then(data => {
            return data.user.getIdToken()
        })
        .then(token => {
            return res.json({token})
        })
        .catch(erro => {
            console.error(erro)
            return res.status(403).json({general: "Email ou senha errada, tente novamente!"})
        })
};
// Upaload a profile picture
exports.upLoadImage = (req, res) => {
    const BusBoy = require('busboy');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const busboy = new BusBoy({headers: req.headers});
    let nomeArquivoImagem;
    let imagemfinal = {}

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        console.log(filename)
        if (mimetype !== 'image/png' && mimetype !== 'image/jpeg'){
            return res.status(400).json({errado: "Tipo de arquivo não compatível"})
        }
        // identificar a extensão do arquivo (meu.arquivo.png)
        const imageExtension = filename.split('.')[filename.split('.').length -1]
        // 2392038242.png
        nomeArquivoImagem = `${Math.round(Math.random()*1000000000)}. ${imageExtension}`
        const caminhoArquivo = path.join(os.tmpdir(), nomeArquivoImagem)
        imagemfinal = { caminhoArquivo, mimetype } 
        // Criar o arquivo (no diretório) atraves do sistema de manipulação de arquivos (fs) pipe() - NodeJs
        file.pipe(fs.createWriteStream(caminhoArquivo))
    });
    
    busboy.on('finish', () => {
        admin.storage().bucket().upload(imagemfinal.caminhoArquivo, {
            resumable: false, 
            metadata: {
                metadata : {
                    contentType: imagemfinal.mimetype
            }}
        })
        .then(() => {
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${nomeArquivoImagem}?alt=media`
            console.log(imageUrl)
            return admin.firestore().doc(`/users/${req.user.handle}`).update({imageUrl})
        } )
        .then(()=> {
            return res.json({message: "Imagem atualizada com sucesso"})
        })
        .catch((erro) => {
            console.error(erro)
            return res.status(500).json({errorr: erro.code})
        })
    });
    
    busboy.end(req.rawBody);
};
// Adiciona detalhes a conta do usuario
exports.addUserDetails = (req, res) => {
    let userDetails = reduceUseDatails(req.body)
    admin.firestore().doc(`/users/${req.user.handle}`).update(userDetails)
       .then(()=> {
            return res.status(200).json({ message: 'Detalhes adicionados com sucesso' })
        })
        .catch(erro => {
            console.error(erro)
            return res.status(500).json({ error: `Não adicionei nada ;-( ${erro.code}`})
    })
};
// get on use details
exports.getAuthenticatedUser = (req, res) => {
    let resData = {}
    admin.firestore().doc(`/users/${req.user.handle}`).get()
    .then(doc => {
        if (doc.exists){
            resData.credentials = doc.data()
            return admin.firestore().collection('likes')
                        .where('userHandle','==', req.user.handle).get()
        }
    })
    .then(data => {
        resData.likes = []
        data.forEach(doc => {
            resData.likes.push(doc.data())
        })
        return admin.firestore().collection(`notifications`)
            .where('recipient', '==', req.user.handle)
            .orderBy('createAt', 'desc')
            .limit(10)
            .get()
    })
    .then((data => {
        resData.notifications = []
        data.forEach(doc => {
            resData.notifications.push({
                notificationId: doc.id,
                recipient: doc.data().recipient,
                sender: doc.data().sender,
                createAt: doc.data().createAt,
                telaId: doc.data().telaId,
                type: doc.data().type,
                read: doc.data().read
            })
        })
        return res.json(resData)
    }))
    .catch(erro => {
        console.log(erro)
        return res.status(500).json({error: `Ta bom sqn ${erro.code}  `})
    })
};
// Get detalhes de qualquer usuário
exports.getUserDetails = (req, res) => {
    let userData = {}
    admin.firestore().doc(`/users/${req.params.handle}`).get()
        .then(doc => {
            if (doc.exists){
                userData.user = doc.data()
                return admin.firestore()
                    .collection('telas')
                    .where('userHandle', '==', req.params.handle)
                    .orderBy('createAt', 'desc')
                    .get()
            }else {
                return res.status(404).json({errro: 'Não encontrei você'})
            }
        })
        .then(data => {
            userData.telas = []
            data.forEach(doc => {
                userData.telas.push({
                    body: doc.data().body,
                    createAt: doc.data().createAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    likeCount: doc.data().likeCount,
                    commentCount: doc.data().commentCount,
                    telaId: doc.id
                })
            })
            return res.json(userData)
        })
        .catch( erro => {
            console.error(erro)
            return res.status(500).json({errro: erro.code})
        })
};

exports.marcarNotesLidos = (req, res) => {
    let batch = admin.firestore().batch()
    req.body.forEach(notificationId => {
        const notification = admin.firestore().doc(`/notifications/${notificationId}`)
        batch.update(notification, {read: true})
    })
    batch
        .commit()
        .then(() => {
            return res.json({Message: 'Notificação marcada como lida'})
        })
        .catch( erro => {
            console.error(erro)
            return res.status(500).json({errro: erro.code})
        })
};