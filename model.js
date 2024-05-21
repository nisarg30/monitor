var mongoose = require('mongoose');
var Schema = mongoose.Schema;

limitSchema = new Schema({

	stockname   : String,
    log : [{
        _id : false,
        time : String,
        direction : Number,
        result : Boolean
    }]
},{ collection: 'trigger'});  

limitschema = mongoose.model('limit_lg', limitSchema);

module.exports = limitschema;